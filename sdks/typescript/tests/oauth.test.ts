import assert from "node:assert/strict";
import test from "node:test";
import { WiseOAuth, OAuthError, TokenManager, createOAuthState, validateOAuthState } from "../src/index.js";

test("OAuth builds encoded grants and a session-bound authorization URL", async () => {
  const bodies: URLSearchParams[] = [];
  const oauth = new WiseOAuth({ clientId: "client", clientSecret: "secret", fetch: async (_url, init) => {
    assert.match(new Headers(init?.headers).get("authorization")!, /^Basic /);
    bodies.push(new URLSearchParams(String(init?.body)));
    return Response.json({ access_token: "access", token_type: "bearer", expires_in: 3600 });
  } });
  const redirectUri = "https://app.test/callback?welcome=yes";
  const state = createOAuthState();
  const authorization = new URL(oauth.authorizationUrl({ redirectUri, state }));
  assert.equal(authorization.origin, "https://wise-sandbox.com");
  assert.equal(authorization.searchParams.get("redirect_uri"), redirectUri);
  assert.equal(authorization.searchParams.get("state"), state);
  validateOAuthState(state, state);
  assert.throws(() => validateOAuthState("wrong", state), OAuthError);
  assert.throws(() => validateOAuthState("é", "a"), OAuthError);
  await oauth.exchangeCode({ code: "a+b & c", redirectUri });
  assert.equal(bodies[0]?.get("code"), "a+b & c");
  assert.equal(bodies[0]?.get("client_id"), "client");
  await oauth.exchangeRegistrationCode({ email: "a+b@example.test", registrationCode: "registration" });
  assert.equal(bodies[1]?.get("grant_type"), "registration_code");
  assert.equal(bodies[1]?.get("email"), "a+b@example.test");
  assert.equal((await oauth.refresh("old-refresh")).refreshToken, "old-refresh");
  assert.equal(bodies[2]?.get("grant_type"), "refresh_token");
  await oauth.createClientToken();
  assert.equal(bodies[3]?.get("grant_type"), "client_credentials");
});

test("OAuth failures do not expose response credentials or retry exchanges", async () => {
  let calls = 0;
  const oauth = new WiseOAuth({ clientId: "client", clientSecret: "secret", fetch: async () => {
    calls++;
    return Response.json({ refresh_token: "sensitive-value" }, { status: 500 });
  } });
  await assert.rejects(oauth.createClientToken(), (error: OAuthError) => {
    assert.equal(error.statusCode, 500);
    assert.doesNotMatch(String(error), /sensitive-value|secret/);
    return true;
  });
  assert.equal(calls, 1);
});

test("concurrent requests share refresh and retry persistence without another rotation", async () => {
  let acquired = 0;
  let saved = 0;
  const manager = new TokenManager({ acquire: async () => {
    acquired++;
    return { accessToken: "new", tokenType: "bearer", refreshToken: "rotated", expiresAt: Date.now() + 3600000 };
  }, onTokens: async (tokens) => {
    assert.equal(tokens.refreshToken, "rotated");
    saved++;
    if (saved === 1) throw new Error("Storage unavailable");
  } });
  const failed = await Promise.allSettled(Array.from({ length: 20 }, () => manager.getAccessToken()));
  assert(failed.every((value) => value.status === "rejected"));
  assert.equal(acquired, 1);
  const tokens = await Promise.all(Array.from({ length: 20 }, () => manager.getAccessToken()));
  assert(tokens.every((value) => value === "new"));
  assert.equal(acquired, 1);
  assert.equal(saved, 2);
});

test("token refresh receives the last stored refresh token", async () => {
  const manager = new TokenManager({ initialTokens: { accessToken: "old", refreshToken: "stored", tokenType: "bearer", expiresAt: Date.now() - 1 },
    acquire: async (previous) => {
      assert.equal(previous?.refreshToken, "stored");
      return { accessToken: "new", tokenType: "bearer", expiresAt: Date.now() + 3600000 };
    } });
  assert.equal(await manager.getAccessToken(), "new");
});

test("OAuth rejects unknown authorization environments for JavaScript callers", () => {
  const oauth = new WiseOAuth({ clientId: "client", clientSecret: "secret",
    authorizationEnvironment: "sandbx" as "sandbox",
  });
  assert.throws(() => oauth.authorizationUrl({ redirectUri: "https://app.test/callback", state: "state" }), OAuthError);
});

test("OAuth validates expiry metadata and keeps the earliest refresh expiry", async () => {
  let metadata: Record<string, unknown> = {};
  const oauth = new WiseOAuth({ clientId: "client", clientSecret: "secret", fetch: async () =>
    Response.json({ access_token: "access", token_type: "bearer", expires_in: 3600, ...metadata }),
  });
  for (const invalid of [
    { refresh_token_expires_in: -1 }, { refresh_token_expires_in: 1e308 },
    { refresh_token_expires_at: "not-a-date" }, { refresh_token_expires_at: "" },
    { refresh_token_expires_at: "2099-01-01T00:00:00" }, { expires_at: "2099-01-01T00:00:00" },
  ]) {
    metadata = invalid;
    await assert.rejects(oauth.createClientToken(), OAuthError);
  }
  const before = Date.now();
  metadata = { refresh_token_expires_in: 0, refresh_token_expires_at: "2099-01-01T00:00:00Z" };
  const tokens = await oauth.createClientToken();
  assert(tokens.refreshTokenExpiresAt! >= before && tokens.refreshTokenExpiresAt! <= Date.now());
  const earlier = new Date(Date.now() + 300000).toISOString();
  metadata = { refresh_token_expires_in: 3600, refresh_token_expires_at: earlier };
  assert.equal((await oauth.createClientToken()).refreshTokenExpiresAt, Date.parse(earlier));
  metadata = {};
  assert.equal((await oauth.createClientToken()).refreshTokenExpiresAt, undefined);
});
