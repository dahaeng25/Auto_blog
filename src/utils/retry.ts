export interface RetryOptions {
  attempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, nextDelayMs: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const factor = options.factor ?? 2;
  const maxDelayMs = options.maxDelayMs ?? 10_000;
  let delayMs = options.initialDelayMs ?? 800;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const retryable =
        attempt < attempts &&
        (options.shouldRetry ? options.shouldRetry(error, attempt) : true);
      if (!retryable) break;

      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
      delayMs = Math.min(Math.floor(delayMs * factor), maxDelayMs);
    }
  }

  throw lastError;
}
