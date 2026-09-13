import assert from "node:assert/strict";
import test from "node:test";
import { WiseClient, WiseEnvironment, WiseError } from "../src/index.js";

test("personal tokens use the pinned sandbox API and remain current", async () => {
  let token = "first";
  const seen: string[] = [];
  const client = new WiseClient({ accessToken: () => token, fetch: async (input, init) => {
    assert.equal(String(input), "https://api.wise-sandbox.com/2026Q3/profiles");
    assert.equal(init?.redirect, "manual");
    seen.push(new Headers(init?.headers).get("Authorization")!);
    return Response.json([]);
  } });
  await client.profiles.list();
  token = "second";
  await client.profiles.list();
  assert.deepEqual(seen, ["Bearer first", "Bearer second"]);
});

test("OAuth uses Basic auth even when a personal token is configured", async () => {
  const client = new WiseClient({ accessToken: "personal", clientId: "client", clientSecret: "secret", fetch: async (input, init) => {
    assert.equal(String(input), "https://api.wise-sandbox.com/2026Q3/oauth/token");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Basic Y2xpZW50OnNlY3JldA==");
    assert.equal(new Headers(init?.headers).get("Content-Type"), "application/x-www-form-urlencoded");
    assert.equal(String(init?.body), "grant_type=client_credentials");
    return Response.json({ access_token: "new", expires_in: 3600, token_type: "bearer" });
  } });
  assert.equal((await client.oauth.createToken({ grant_type: "client_credentials" })).access_token, "new");
});

test("card requests use the separate host", async () => {
  const client = new WiseClient({ accessToken: "personal", environment: WiseEnvironment.Production, fetch: async (input) => {
    assert.equal(new URL(String(input)).origin, "https://twcard.wise.com");
    return Response.json({});
  } });
  await client.cards.sensitiveDetails.get({ "x-tw-twcard-card-token": "card", keyVersion: 1, encryptedPayload: "encrypted" });
});

test("reads honor Retry-After; writes and simulation GETs never retry", async () => {
  let calls = 0;
  const client = new WiseClient({ accessToken: "test", maxRetries: 2, fetch: async () => {
    calls++;
    return calls === 1 ? Response.json({}, { status: 429, headers: { "Retry-After": "0" } }) : Response.json([]);
  } });
  await client.profiles.list();
  assert.equal(calls, 2);
  const failing = new WiseClient({ accessToken: "test", maxRetries: 5, fetch: async () => {
    calls++;
    return Response.json({}, { status: 500 });
  } });
  calls = 0;
  await assert.rejects(failing.quotes.createUnauthenticated({ sourceCurrency: "GBP", targetCurrency: "EUR" }), WiseError);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(failing.simulations.changeTransferState({ transferId: 1, status: "processing" }), WiseError);
  assert.equal(calls, 1);
});

test("SCA error headers survive and 403 is never replayed", async () => {
  let calls = 0;
  const client = new WiseClient({ accessToken: "test", fetch: async () => {
    calls++;
    return Response.json({ errors: [] }, { status: 403, headers: { "x-2fa-approval": "challenge", "x-2fa-approval-result": "REJECTED" } });
  } });
  await assert.rejects(client.profiles.list(), (error: WiseError) => {
    assert.equal(error.statusCode, 403);
    assert.equal(error.rawResponse?.headers.get("x-2fa-approval"), "challenge");
    return true;
  });
  assert.equal(calls, 1);
});
