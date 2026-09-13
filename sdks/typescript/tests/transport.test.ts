import assert from "node:assert/strict";
import test from "node:test";
import { TokenManager, WiseClient, WiseError, WiseTimeoutError } from "../src/index.js";

test("a cancelled request never reaches the transport", async () => {
  const reason = new Error("Cancelled by the caller");
  const controller = new AbortController();
  controller.abort(reason);
  const client = new WiseClient({ accessToken: () => assert.fail("A cancelled request must not acquire a token"), fetch: async () => {
    assert.fail("A cancelled request must not be sent");
  } });
  await assert.rejects(client.profiles.list({ abortSignal: controller.signal }), (error: WiseError) => {
    assert(error instanceof WiseError && !(error instanceof WiseTimeoutError));
    assert.equal(error.cause, reason);
    return true;
  });
});

test("the request deadline includes a stalled token supplier", { timeout: 2000 }, async () => {
  const client = new WiseClient({ timeoutInSeconds: 0.05,
    accessToken: () => new Promise<string>(() => {}),
    fetch: async () => assert.fail("A request without a token must not be sent"),
  });
  await assert.rejects(client.profiles.list(), WiseTimeoutError);
});

test("cancelling a token waiter preserves shared rotation and persistence", { timeout: 2000 }, async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  let started!: () => void;
  const acquiring = new Promise<void>((resolve) => { started = resolve; });
  let acquired = 0, saved = 0, sent = 0;
  const manager = new TokenManager({ acquire: async () => {
    acquired++;
    started();
    await pending;
    return { accessToken: "new", tokenType: "bearer", refreshToken: "rotated", expiresAt: Date.now() + 3600000 };
  }, onTokens: (tokens) => { assert.equal(tokens.refreshToken, "rotated"); saved++; } });
  const client = new WiseClient({ accessToken: manager.getAccessToken, fetch: async (_url, init) => {
    assert.equal(saved, 1);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer new");
    sent++;
    return Response.json([]);
  } });
  const controller = new AbortController();
  const reason = new Error("Caller cancelled");
  const request = client.profiles.list({ abortSignal: controller.signal });
  await acquiring;
  controller.abort(reason);
  await assert.rejects(request, (error: WiseError) => error instanceof WiseError && error.cause === reason);
  finish();
  await client.profiles.list();
  assert.deepEqual({ acquired, saved, sent }, { acquired: 1, saved: 1, sent: 1 });
});

test("a delayed header supplier cannot send a request after its deadline", { timeout: 2000 }, async () => {
  let finish!: (value: string) => void;
  const header = new Promise<string>((resolve) => { finish = resolve; });
  let sent = 0;
  const client = new WiseClient({ accessToken: "fixture", timeoutInSeconds: 0.05,
    headers: { "X-Custom": () => header },
    fetch: async () => { sent++; return Response.json([]); },
  });
  await assert.rejects(client.profiles.list(), WiseTimeoutError);
  finish("ready");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sent, 0);
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
