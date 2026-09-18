import assert from "node:assert/strict";
import test from "node:test";
import { PermanentError, retryableStatus, withRetry } from "../scripts/retry.mjs";
import { describeMissingOverrides, overrideSuggestion } from "../scripts/check-spec.mjs";

const quiet = { delay: 0, wait: async () => {}, warn: () => {} };

test("a scheduled run survives a brief network failure", async () => {
  let attempts = 0;
  const value = await withRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new TypeError("fetch failed");
    return "ok";
  }, quiet);
  assert.equal(value, "ok");
  assert.equal(attempts, 3);
});

test("retries give up rather than hiding a persistent outage", async () => {
  let attempts = 0;
  await assert.rejects(withRetry(async () => { attempts += 1; throw new Error("fetch failed"); }, quiet), /fetch failed/);
  assert.equal(attempts, 4);
});

test("an answer that retrying cannot fix fails on the first attempt", async () => {
  let attempts = 0;
  await assert.rejects(withRetry(async () => {
    attempts += 1;
    throw new PermanentError("Spec download failed: HTTP 404");
  }, quiet), /HTTP 404/);
  assert.equal(attempts, 1);
});

test("backpressure and server faults are retried; client mistakes are not", () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504]) assert.equal(retryableStatus(status), true);
  for (const status of [400, 401, 403, 404, 410]) assert.equal(retryableStatus(status), false);
});

test("a new operation reports the override a maintainer has to add", () => {
  const missing = [{
    method: "post", path: "/simulation/sanction-cases",
    operation: { operationId: "simulateSanctionCase", tags: ["simulation"] },
    security: [{ UserToken: [] }],
  }];
  const message = describeMissingOverrides(missing);
  assert.match(message, /Add Fern overrides for 1 new operation/);
  assert.match(message, /POST \/simulation\/sanction-cases \(simulateSanctionCase\)/);
  assert.match(message, /^paths:$/m);
  assert.match(message, /^ {2}\/simulation\/sanction-cases:$/m);
  // Writes and simulation helpers must never retry, and a token maps to AccessToken.
  assert.match(message, /- AccessToken: \[\]/);
  assert.match(message, /x-fern-retries:\n {8}disabled: true/);
});

test("override suggestions follow the authentication and retry rules checks enforce", () => {
  const read = overrideSuggestion({ method: "get", path: "/accounts",
    operation: { operationId: "listAccounts" }, security: [] });
  assert.match(read, /security: \[\]/);
  assert(!read.includes("x-fern-retries"), "Reads outside simulation keep generated retries");
  const partner = overrideSuggestion({ method: "get", path: "/partner",
    operation: { operationId: "getPartner" }, security: [{ BasicAuth: [] }] });
  assert.match(partner, /- ClientCredentials: \[\]/);
  const simulated = overrideSuggestion({ method: "get", path: "/simulation/transfers/1",
    operation: { operationId: "simulate" }, security: [{ UserToken: [] }] });
  assert.match(simulated, /x-fern-retries/);
});
