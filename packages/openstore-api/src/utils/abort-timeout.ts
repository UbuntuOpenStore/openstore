// SPDX-License-Identifier: AGPL-3.0-or-later

// A rejection after the timeout fires is almost always caused by the abort.
export async function withAbortTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMessage = `Timed out after ${timeoutMs}ms`,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(timeoutMessage, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
