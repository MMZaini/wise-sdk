import assert from "node:assert/strict";
import test from "node:test";
import { WiseClient, WiseError, WiseTimeoutError } from "../src/index.js";

test("a cancelled request never reaches the transport", async () => {
  const reason = new Error("Cancelled by the caller");
  const controller = new AbortController();
  controller.abort(reason);
  const client = new WiseClient({ accessToken: "fixture", fetch: async () => {
    assert.fail("A cancelled request must not be sent");
  } });
  await assert.rejects(client.profiles.list({ abortSignal: controller.signal }), (error: WiseError) => {
    assert(error instanceof WiseError && !(error instanceof WiseTimeoutError));
    assert.equal(error.cause, reason);
    return true;
  });
});

test("cancellation interrupts Retry-After without another request", { timeout: 2000 }, async () => {
  const controller = new AbortController();
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  let calls = 0;
  const client = new WiseClient({ accessToken: "fixture", fetch: async () => {
    calls++;
    markStarted();
    return Response.json({}, { status: 429, headers: { "Retry-After": "60" } });
  } });
  const request = client.profiles.list({ abortSignal: controller.signal });
  await started;
  // Let response handling enter the retry delay before cancelling.
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  await assert.rejects(request, (error: WiseError) => error instanceof WiseError && !(error instanceof WiseTimeoutError));
  assert.equal(calls, 1);
});

test("the request deadline covers a stalled JSON body after headers", { timeout: 2000 }, async () => {
  let signal: AbortSignal | undefined;
  let calls = 0;
  const client = new WiseClient({ accessToken: "fixture", timeoutInSeconds: 0.05, fetch: async (_input, init) => {
    calls++;
    signal = init?.signal ?? undefined;
    assert(signal);
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode("["));
      signal!.addEventListener("abort", () => controller.error(signal!.reason), { once: true });
    } }), { headers: { "Content-Type": "application/json" } });
  } });
  await assert.rejects(client.profiles.list(), WiseTimeoutError);
  assert.equal(signal?.aborted, true);
  assert.equal(calls, 1);
});
