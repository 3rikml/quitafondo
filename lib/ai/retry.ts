import { isNetworkError } from "./friendlyError";

/**
 * Runs `task`, and when it fails because the connection dropped (typically
 * mid-download of a model) tries again up to `retries` times, waiting longer
 * each time. Any other error is thrown straight away.
 */
export async function retryOnNetworkError<T>(
  task: () => Promise<T>,
  { retries = 2, delayMs = 1500 }: { retries?: number; delayMs?: number } = {}
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= retries || !isNetworkError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
}
