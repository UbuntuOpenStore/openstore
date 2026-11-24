// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { withAbortTimeout } from './abort-timeout';

describe('withAbortTimeout', () => {
  test('passes a live signal and returns the operation result', async () => {
    const result = await withAbortTimeout(1000, async (signal) => {
      assert.equal(signal.aborted, false);
      return 'done';
    });
    assert.equal(result, 'done');
  });

  test('aborts the signal after the timeout', async () => {
    await assert.rejects(
      withAbortTimeout(
        5,
        (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
        'Timed out fetching https://example.com',
      ),
      /Timed out fetching https:\/\/example\.com/,
    );
  });

  test('keeps the original error as the cause of the timeout', async () => {
    const original = new Error('network aborted');
    await assert.rejects(
      withAbortTimeout(
        5,
        (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(original));
          }),
      ),
      (error: Error & { cause?: unknown }) => error.message === 'Timed out after 5ms' && error.cause === original,
    );
  });

  test('does not rewrite errors thrown before the timeout', async () => {
    await assert.rejects(
      withAbortTimeout(1000, async () => Promise.reject(new Error('boom'))),
      /boom/,
    );
  });
});
