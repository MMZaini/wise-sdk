import { setTimeout as delay } from "node:timers/promises";
import { fetcher, unknownRawResponse, type APIResponse, type Fetcher } from "./generated/core/fetcher/index.js";

function retryDelay(headers: Headers, attempt: number): number {
  const value = headers.get("Retry-After");
  if (value) {
    if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 1000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return Math.min(1000 * 2 ** attempt, 60000) * (0.9 + Math.random() * 0.2);
}

async function untilAborted<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    // Observe late failures without cancelling shared token rotation or persistence.
    return await Promise.race([Promise.resolve().then(operation), cancelled]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

/** One deadline covers credentials, retries and buffered responses. Only reads retry. */
export async function requestWithDeadline<R>(args: Fetcher.Args,
  prepare?: () => Promise<Fetcher.Args>): Promise<APIResponse<R, Fetcher.Error>> {
  const read = ["GET", "HEAD", "OPTIONS"].includes(args.method.toUpperCase()) &&
    !new URL(args.url).pathname.includes("/simulation/");
  const retries = read ? (args.maxRetries ?? 2) : 0;
  if (!Number.isSafeInteger(retries) || retries < 0) throw new RangeError("maxRetries must be a non-negative integer");
  const milliseconds = args.timeoutMs ?? 60000;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 2147483647) throw new RangeError("Invalid request timeout");
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new DOMException("Request deadline exceeded", "TimeoutError")), milliseconds);
  const signal = args.abortSignal ? AbortSignal.any([args.abortSignal, deadline.signal]) : deadline.signal;
  const aborted = () => ({ ok: false as const, error: args.abortSignal?.aborted
    ? { reason: "unknown" as const, errorMessage: "The user aborted a request", cause: args.abortSignal.reason }
    : { reason: "timeout" as const, cause: deadline.signal.reason }, rawResponse: unknownRawResponse });
  try {
    if (signal.aborted) return aborted();
    const prepared = prepare ? await untilAborted(prepare, signal) : args;
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) return aborted();
      const response = await untilAborted(() => fetcher<R>({ ...prepared, timeoutMs: undefined, maxRetries: 0, abortSignal: signal }), signal);
      if (signal.aborted) return aborted();
      if (response.ok || response.error.reason !== "status-code" || attempt >= retries ||
          !([408, 429].includes(response.error.statusCode) || response.error.statusCode >= 500)) return response;
      await delay(Math.min(retryDelay(response.rawResponse.headers, attempt), 2147483647), undefined, { signal });
    }
  } catch (error) {
    if (signal.aborted) return aborted();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
