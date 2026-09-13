import assert from "node:assert/strict";
import test from "node:test";
import { fromJson, toJson } from "../src/json.js";
import { fetcherImpl } from "../src/generated/core/fetcher/Fetcher.js";

test("JSON preserves large IDs, decimals, and marker-like strings", () => {
  const value = { id: 9223372036854775807n, amount: 12.34, reference: "123#bigint#", count: 2 };
  const text = toJson(value);
  assert.match(text, /"id":9223372036854775807/);
  assert.deepEqual(fromJson(text), value);
  assert.throws(() => toJson({ id: 9007199254740992 }), RangeError);
});

test("JSON rejects malformed strings and does not mutate object prototypes", () => {
  for (const text of ['"line\nfeed"', '"\\uZZZZ"', '{"x":1} trailing', '[01]', '[1,]']) {
    assert.throws(() => fromJson(text), SyntaxError);
  }
  const value = fromJson<Record<string, unknown>>('{"__proto__":{"polluted":true}}');
  assert.equal(Object.hasOwn(value, "__proto__"), true);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("malformed success bodies fail and retain the HTTP response", async () => {
  const result = await fetcherImpl({ url: "https://example.test/profiles", method: "GET", maxRetries: 0,
    fetchFn: async () => new Response("<html>oops</html>", { status: 200, headers: { "x-request-id": "trace" } }) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.reason, "non-json");
  assert.equal(result.rawResponse.headers.get("x-request-id"), "trace");
});

test("redirects are errors when the transport returns them", async () => {
  const result = await fetcherImpl({ url: "https://example.test/profiles", method: "GET", maxRetries: 0,
    fetchFn: async () => new Response(null, { status: 302 }) });
  assert.equal(result.ok, false);
});
