import { setTimeout as sleep } from "node:timers/promises";

/** Thrown when another attempt cannot help; stops the retry loop immediately. */
export class PermanentError extends Error {}

/** Transport-level failures and the status codes upstream uses for backpressure. */
export const retryableStatus = (status) => status === 408 || status === 425 || status === 429 || status >= 500;

/**
 * A scheduled run must survive brief network failures. A wrong answer from
 * upstream still fails on the first attempt, so real breakage stays visible.
 */
export async function withRetry(operation, { attempts = 4, delay = 2000, wait = sleep, warn = console.warn } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (error instanceof PermanentError || attempt >= attempts) throw error;
      const pause = delay * 2 ** (attempt - 1);
      warn(`Attempt ${attempt} of ${attempts} failed: ${error.message}. Retrying in ${pause}ms.`);
      await wait(pause);
    }
  }
}
