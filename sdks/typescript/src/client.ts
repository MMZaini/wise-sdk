import { WiseClient as GeneratedClient } from "./generated/Client.js";
import type { BaseClientOptions } from "./generated/BaseClient.js";
import { WiseEnvironment, type WiseEnvironmentUrls } from "./generated/environments.js";
import type { FetchFunction } from "./generated/core/fetcher/index.js";
import { requestWithDeadline } from "./transport.js";

export type AccessToken = string | (() => string | Promise<string>);
export interface WiseClientOptions {
  /** Defaults to Sandbox. Custom HTTPS API and card URLs support proxies. */
  environment?: WiseEnvironmentUrls;
  /** Omit to read WISE_ACCESS_TOKEN at request time; false disables that fallback. */
  accessToken?: AccessToken | false;
  /** Required together only when using oauth.createToken(). */
  clientId?: string;
  clientSecret?: string;
  headers?: BaseClientOptions["headers"];
  externalCorrelationId?: BaseClientOptions["externalCorrelationId"];
  timeoutInSeconds?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  logging?: BaseClientOptions["logging"];
}

export function validateEnvironment(environment: WiseEnvironmentUrls): WiseEnvironmentUrls {
  const urls = {} as WiseEnvironmentUrls;
  for (const service of ["api", "cards"] as const) {
    const url = new URL(environment[service]);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new TypeError("Environment URLs must use HTTPS without credentials, query or fragment");
    }
    urls[service] = url.href.replace(/\/$/, "");
  }
  return Object.freeze(urls);
}

export function validateToken(token: unknown): asserts token is string {
  if (typeof token !== "string" || !/^[^\s;,]+$/.test(token)) throw new TypeError("Provide one non-empty access token");
}

export function basicAuthorization(clientId?: string, clientSecret?: string): string {
  if (!clientId || !clientSecret || /[:\r\n]/.test(clientId) || /[\r\n]/.test(clientSecret)) {
    throw new TypeError("Provide clientId and clientSecret for OAuth token requests");
  }
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

/** Generated resources with sandbox defaults, current tokens and bounded read retries. */
export class WiseClient extends GeneratedClient {
  readonly environment: WiseEnvironmentUrls;

  constructor(options: WiseClientOptions = {}) {
    const environment = validateEnvironment(options.environment ?? WiseEnvironment.Sandbox);
    const origins = new Set(Object.values(environment).map((url) => new URL(url).origin));
    if (options.maxRetries !== undefined && (!Number.isSafeInteger(options.maxRetries) || options.maxRetries < 0)) {
      throw new RangeError("maxRetries must be a non-negative integer");
    }
    if (options.timeoutInSeconds !== undefined && (!Number.isFinite(options.timeoutInSeconds) || options.timeoutInSeconds <= 0)) {
      throw new RangeError("timeoutInSeconds must be positive");
    }
    const send = options.fetch ?? globalThis.fetch;
    const guardedFetch: typeof fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (!origins.has(url.origin) || url.username || url.password) throw new TypeError("Unexpected request origin");
      init?.signal?.throwIfAborted();
      return send(input, { ...init, redirect: "manual" });
    };
    const guardedFetcher: FetchFunction = (args) => requestWithDeadline(args, async () => {
      const headers = Object.fromEntries(Object.entries(args.headers ?? {}).filter(([key]) => key.toLowerCase() !== "authorization"));
      if (new URL(args.url).pathname.endsWith("/oauth/token")) {
        headers.Authorization = basicAuthorization(options.clientId, options.clientSecret);
      } else {
        const token = options.accessToken === false ? undefined : typeof options.accessToken === "function"
          ? await options.accessToken() : options.accessToken ?? process.env.WISE_ACCESS_TOKEN;
        if (token !== undefined) {
          validateToken(token);
          headers.Authorization = `Bearer ${token}`;
        }
      }
      return { ...args, headers, fetchFn: guardedFetch };
    });
    super({ environment, auth: false, headers: { "User-Agent": "wise-sdk", ...options.headers },
      externalCorrelationId: options.externalCorrelationId, timeoutInSeconds: options.timeoutInSeconds,
      maxRetries: options.maxRetries, logging: options.logging, fetch: guardedFetch, fetcher: guardedFetcher });
    this.environment = environment;
  }
}
