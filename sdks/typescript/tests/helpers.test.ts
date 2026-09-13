import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { WiseClient, WiseError, PaginationError, iterRecipients, iterActivities, iterTransfers, verifyWebhookSignature, getScaChallenge } from "../src/index.js";

test("shared webhook signature requires the exact raw body", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../../tests/fixtures/webhook.json", import.meta.url), "utf8"));
  assert.equal(verifyWebhookSignature({ ...fixture, body: Buffer.from(fixture.body) }), true);
  assert.equal(verifyWebhookSignature({ ...fixture, body: Buffer.from(fixture.body + "\n") }), false);
  assert.equal(verifyWebhookSignature({ ...fixture, body: Buffer.from(fixture.body), signature: "not base64!" }), false);
});

test("only explicit rejected SCA responses produce a challenge", () => {
  const rawResponse = new Response(null, { status: 403,
    headers: { "x-2fa-approval": "one-time", "x-2fa-approval-result": "REJECTED" } });
  assert.equal(getScaChallenge(new WiseError({ statusCode: 403 })), undefined);
  assert.deepEqual(getScaChallenge(new WiseError({ statusCode: 403, rawResponse })), { oneTimeToken: "one-time" });
  assert.equal(getScaChallenge(new WiseError({ statusCode: 401, rawResponse })), undefined);
});

test("recipient seek pagination follows zero and large cursors, including empty pages", async () => {
  const seen: Array<string | null> = [];
  const client = new WiseClient({ accessToken: "test", fetch: async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("currency"), "GBP");
    const cursor = url.searchParams.get("seekPosition");
    seen.push(cursor);
    if (cursor === null) return Response.json({ content: [], seekPositionForNext: 0 });
    if (cursor === "0") return new Response('{"content":[{"id":1}],"seekPositionForNext":9223372036854775807}');
    return Response.json({ content: [{ id: 2 }] });
  } });
  const ids = [];
  for await (const recipient of iterRecipients(client, { currency: "GBP" })) ids.push(recipient.id);
  assert.deepEqual(ids, [1, 2]);
  assert.deepEqual(seen, [null, "0", "9223372036854775807"]);
});

test("repeated cursors fail and early termination does not prefetch", async () => {
  let calls = 0;
  const client = new WiseClient({ accessToken: "test", fetch: async () => {
    calls++;
    return Response.json({ activities: [{ id: "one" }], cursor: "same" });
  } });
  for await (const _ of iterActivities(client, { profileId: 1 })) break;
  assert.equal(calls, 1);
  await assert.rejects(async () => { for await (const _ of iterActivities(client, { profileId: 1 })) { /* consume */ } }, PaginationError);
  assert.equal(calls, 3);
});

test("transfer pagination advances by the returned count until an empty page", async () => {
  const offsets: string[] = [];
  const client = new WiseClient({ accessToken: "test", fetch: async (input) => {
    const offset = new URL(String(input)).searchParams.get("offset")!;
    offsets.push(offset);
    return Response.json(offset === "0" ? [{ id: 1, quote: "quote-uuid" }] : []);
  } });
  const transfers = [];
  for await (const transfer of iterTransfers(client, { limit: 100 })) transfers.push(transfer);
  assert.equal(transfers[0]?.quote, "quote-uuid");
  assert.deepEqual(offsets, ["0", "1"]);
});

test("statement downloads preserve file bytes and request the selected format", async () => {
  const bytes = new Uint8Array([0, 255, 80, 68, 70, 13, 10]);
  const client = new WiseClient({ accessToken: "test", fetch: async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/2026Q3/profiles/1/balance-statements/2/statement.pdf");
    assert.equal(url.searchParams.get("currency"), "GBP");
    assert.equal(url.searchParams.get("intervalStart"), "2026-01-01T00:00:00Z");
    return new Response(bytes, { headers: { "content-type": "application/pdf", "x-trace-id": "trace" } });
  } });
  const { data, rawResponse } = await client.statements.download({ profileId: 1, balanceId: 2, format: "pdf",
    currency: "GBP", intervalStart: "2026-01-01T00:00:00Z", intervalEnd: "2026-02-01T00:00:00Z" }).withRawResponse();
  assert.deepEqual(new Uint8Array(await data.arrayBuffer()), bytes);
  assert.equal(rawResponse.headers.get("x-trace-id"), "trace");
});
