// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isSourceUnchanged, parseOptions, shouldPrune, shouldUpdateValidators } from './appstream-sync';

const STORED = { etag: '"v1"', last_modified: 'Mon, 01 Jan 2024 00:00:00 GMT' };
const CHANGED_MODIFIED = 'Tue, 02 Jan 2024 00:00:00 GMT';

describe('appstream-sync guards', () => {
  describe('parseOptions', () => {
    test('accepts supported flags in any order', () => {
      assert.deepEqual(parseOptions([]), { force: false, dryRun: false });
      assert.deepEqual(parseOptions(['--force']), { force: true, dryRun: false });
      assert.deepEqual(parseOptions(['--dry-run']), { force: false, dryRun: true });
      assert.deepEqual(parseOptions(['--limit', '3', '--dry-run', '--force']), {
        force: true,
        dryRun: true,
        limit: 3,
      });
    });

    test('rejects malformed limits before any work is done', () => {
      for (const args of [
        ['--limit'],
        ['--limit', 'foo'],
        ['--limit', '0'],
        ['--limit', '-1'],
        ['--limit', '1.5'],
        ['--limit', '1e3'],
        ['--limit', ' 2'],
      ]) {
        assert.throws(() => parseOptions(args), /--limit/, args.join(' '));
      }
    });

    test('rejects unknown flags and attached values', () => {
      assert.throws(() => parseOptions(['--limit=2']), /Unknown option/);
      assert.throws(() => parseOptions(['--bogus']), /Unknown option/);
      assert.throws(() => parseOptions(['sync']), /Unknown option/);
    });

    test('ignores the argument separator injected by the npm command wrapper', () => {
      assert.deepEqual(parseOptions(['--', '--limit', '2']), { force: false, dryRun: false, limit: 2 });
    });
  });

  describe('isSourceUnchanged', () => {
    test('is unchanged when both headers match', () => {
      assert.equal(isSourceUnchanged({ etag: STORED.etag, lastModified: STORED.last_modified }, STORED, false), true);
    });

    test('is changed when either header changes', () => {
      assert.equal(isSourceUnchanged({ etag: '"v2"', lastModified: STORED.last_modified }, STORED, false), false);
      assert.equal(isSourceUnchanged({ etag: STORED.etag, lastModified: CHANGED_MODIFIED }, STORED, false), false);
      assert.equal(isSourceUnchanged({ etag: '"v2"', lastModified: CHANGED_MODIFIED }, STORED, false), false);
    });

    test('ignores headers the server does not send', () => {
      assert.equal(isSourceUnchanged({ etag: STORED.etag }, STORED, false), true);
      assert.equal(isSourceUnchanged({ lastModified: STORED.last_modified }, STORED, false), true);
      assert.equal(isSourceUnchanged({ etag: '"v2"' }, STORED, false), false);
    });

    test('cannot be unchanged without any validator to compare', () => {
      assert.equal(isSourceUnchanged({}, {}, false), false);
      assert.equal(isSourceUnchanged({}, STORED, false), false);
    });

    test('force always reports changed', () => {
      assert.equal(isSourceUnchanged({ etag: STORED.etag, lastModified: STORED.last_modified }, STORED, true), false);
    });
  });

  describe('prune and validator guards', () => {
    test('prune phase runs only for full, successful runs', () => {
      assert.equal(shouldPrune({ force: false, dryRun: false }, []), true);
      assert.equal(shouldPrune({ force: false, dryRun: false, limit: 1 }, []), false);
      assert.equal(shouldPrune({ force: false, dryRun: false }, ['https://failed.example']), false);
    });

    test('validators are written only by real, full, successful runs', () => {
      assert.equal(shouldUpdateValidators({ force: false, dryRun: false }, []), true);
      assert.equal(shouldUpdateValidators({ force: false, dryRun: true }, []), false);
      assert.equal(shouldUpdateValidators({ force: false, dryRun: false, limit: 1 }, []), false);
      assert.equal(shouldUpdateValidators({ force: false, dryRun: false }, ['https://failed.example']), false);
    });
  });
});
