import { randomBytes, timingSafeEqual } from "node:crypto";
import { WiseClient, validateToken, basicAuthorization, type WiseClientOptions } from "../client.js";
import { WiseError } from "../generated/errors/WiseError.js";
import type { TokenResponse } from "../generated/api/types/TokenResponse.js";

export interface OAuthTokens {
  accessToken: string;
  tokenType: "bearer";
  /** Unix timestamp in milliseconds. */
  expiresAt: number;
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
  scope?: string;
}

export class OAuthError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = "OAuthError";
  }
}

export interface WiseOAuthOptions extends Omit<WiseClientOptions, "accessToken"> {
  clientId: string;
  clientSecret: string;
  /** Required for authorization URLs when the API is accessed through a proxy. */
  authorizationEnvironment?: "sandbox" | "production";
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/** Compare with the value stored for this browser session, then consume it once. */
export function validateOAuthState(received: string | null | undefined, expected: string): void {
  const actual = Buffer.from(received ?? "");
  const stored = Buffer.from(expected);
  if (!actual.length || !stored.length || actual.length !== stored.length ||
      !timingSafeEqual(actual, stored)) throw new OAuthError("Invalid OAuth state");
}

function tokenExpiry(relative: number | undefined, absolute: string | undefined, requestedAt: number): number | undefined {
  let expiry: number | undefined;
  if (relative != null) {
    if (!Number.isFinite(relative) || relative < 0) throw new OAuthError("OAuth returned an invalid expiry");
    expiry = requestedAt + relative * 1000;
    if (!Number.isFinite(expiry)) throw new OAuthError("OAuth returned an invalid expiry");
  }
  if (absolute != null) {
    const explicit = Date.parse(absolute);
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(absolute) || !Number.isFinite(explicit)) {
      throw new OAuthError("OAuth returned an invalid expiry");
    }
    expiry = expiry === undefined ? explicit : Math.min(expiry, explicit);
  }
  return expiry;
}

function normalizeTokens(response: TokenResponse, requestedAt: number): OAuthTokens {
  try { validateToken(response.access_token); } catch { throw new OAuthError("OAuth returned an invalid access token"); }
  if (!Number.isFinite(response.expires_in) || response.expires_in! <= 0 ||
      response.token_type?.toLowerCase() !== "bearer") throw new OAuthError("OAuth returned invalid token metadata");
  const expiresAt = tokenExpiry(response.expires_in, response.expires_at, requestedAt)!;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new OAuthError("OAuth returned an expired token");
  return { accessToken: response.access_token, tokenType: "bearer", expiresAt,
    refreshToken: response.refresh_token, scope: response.scope,
    refreshTokenExpiresAt: tokenExpiry(response.refresh_token_expires_in, response.refresh_token_expires_at, requestedAt) };
}

/** Explicit OAuth grants. Token exchanges are never retried automatically. */
export class WiseOAuth {
  private readonly client: WiseClient;
  private readonly clientId: string;
  private readonly authorizationEnvironment?: "sandbox" | "production";

  constructor(options: WiseOAuthOptions) {
    basicAuthorization(options.clientId, options.clientSecret);
    this.clientId = options.clientId;
    this.authorizationEnvironment = options.authorizationEnvironment;
    this.client = new WiseClient({ ...options, accessToken: false });
  }

  authorizationUrl({ redirectUri, state }: { redirectUri: string; state: string }): string {
    if (!state) throw new OAuthError("Provide a session-bound OAuth state");
    const redirect = new URL(redirectUri);
    if (!["https:", "http:"].includes(redirect.protocol) || redirect.username || redirect.password || redirect.hash) {
      throw new OAuthError("Invalid redirect URI");
    }
    const hostname = new URL(this.client.environment.api).hostname;
    const detected = ["api.wise-sandbox.com", "api-mtls.wise-sandbox.com"].includes(hostname) ? "sandbox" :
      ["api.wise.com", "api-mtls.transferwise.com"].includes(hostname) ? "production" : undefined;
    const selected = this.authorizationEnvironment ?? detected;
    if (!selected) throw new OAuthError("Set authorizationEnvironment when using a proxy");
    if (selected !== "sandbox" && selected !== "production") throw new OAuthError("Invalid authorizationEnvironment");
    const sandbox = selected === "sandbox";
    const url = new URL(sandbox ? "https://wise-sandbox.com/oauth/authorize/" : "https://wise.com/oauth/authorize/");
    url.search = new URLSearchParams({ client_id: this.clientId, redirect_uri: redirectUri, state, response_type: "code" }).toString();
    return url.href;
  }

  private async exchange(request: Parameters<WiseClient["oauth"]["createToken"]>[0]): Promise<OAuthTokens> {
    const requestedAt = Date.now();
    try { return normalizeTokens(await this.client.oauth.createToken(request), requestedAt); }
    catch (error) {
      if (error instanceof OAuthError) throw error;
      throw new OAuthError("OAuth token request failed", error instanceof WiseError ? error.statusCode : undefined);
    }
  }

  createClientToken(): Promise<OAuthTokens> {
    return this.exchange({ grant_type: "client_credentials" });
  }

  exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }): Promise<OAuthTokens> {
    if (!code || !redirectUri) throw new OAuthError("Provide code and redirectUri");
    return this.exchange({ grant_type: "authorization_code", client_id: this.clientId, code, redirect_uri: redirectUri });
  }

  exchangeRegistrationCode({ email, registrationCode }: { email: string; registrationCode: string }): Promise<OAuthTokens> {
    if (!email || !registrationCode) throw new OAuthError("Provide email and registrationCode");
    return this.exchange({ grant_type: "registration_code", client_id: this.clientId, email, registration_code: registrationCode });
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    if (!refreshToken) throw new OAuthError("Provide refreshToken");
    const tokens = await this.exchange({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
  }
}

export interface TokenManagerOptions {
  /** Acquire or refresh using the most recently issued token set. */
  acquire: (previous?: Readonly<OAuthTokens>) => Promise<OAuthTokens>;
  initialTokens?: OAuthTokens;
  /** Persist rotated tokens before allowing API requests to use them. */
  onTokens?: (tokens: Readonly<OAuthTokens>) => void | Promise<void>;
  refreshBeforeSeconds?: number;
}

/** Shares one refresh per instance. Multiple processes need an application-level lock. */
export class TokenManager {
  private tokens?: OAuthTokens;
  private pending?: Promise<string>;
  private needsPersistence = false;
  private readonly refreshBeforeMs: number;

  constructor(private readonly options: TokenManagerOptions) {
    this.tokens = options.initialTokens && { ...options.initialTokens };
    this.refreshBeforeMs = (options.refreshBeforeSeconds ?? 60) * 1000;
    if (!Number.isFinite(this.refreshBeforeMs) || this.refreshBeforeMs < 0) throw new RangeError("Invalid refreshBeforeSeconds");
  }

  getAccessToken = (): Promise<string> => {
    if (!this.pending) this.pending = this.resolve().finally(() => { this.pending = undefined; });
    return this.pending;
  };

  private async persist(): Promise<void> {
    if (this.needsPersistence && this.tokens) {
      await this.options.onTokens?.(Object.freeze({ ...this.tokens }));
      this.needsPersistence = false;
    }
  }

  private async resolve(): Promise<string> {
    await this.persist();
    if (!this.tokens || this.tokens.expiresAt - this.refreshBeforeMs <= Date.now()) {
      const tokens = await this.options.acquire(this.tokens && Object.freeze({ ...this.tokens }));
      validateToken(tokens.accessToken);
      if (!Number.isFinite(tokens.expiresAt) || tokens.expiresAt <= Date.now()) throw new OAuthError("Token acquisition returned an expired token");
      this.tokens = { ...tokens };
      this.needsPersistence = true;
      await this.persist();
    }
    validateToken(this.tokens.accessToken);
    if (!Number.isFinite(this.tokens.expiresAt) || this.tokens.expiresAt <= Date.now()) throw new OAuthError("Invalid token expiry");
    return this.tokens.accessToken;
  }
}
