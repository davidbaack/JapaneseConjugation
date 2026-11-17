export const SENTENCE_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Bound transport, body reading, and retries even when a transport ignores abort.
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} run
 * @returns {Promise<T>}
 */
export async function withSentenceDeadline(run) {
  const controller = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {Promise<never>} */
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error('Sentence request timed out.'), {
        code: 'SENTENCE_REQUEST_TIMEOUT',
      });
      reject(error);
      controller.abort(error);
    }, SENTENCE_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
