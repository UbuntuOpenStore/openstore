// SPDX-License-Identifier: AGPL-3.0-or-later
// Registers module-level mocks for the review/parse utils used by the manage-revisions tests.
//
// tsx (esbuild) compiles TS modules with non-configurable getter exports, which breaks
// node:test's `t.mock.method` on module namespaces. The Node-native
// replacement is `mock.module`, which must be registered BEFORE the app module graph loads.

// Import this module FIRST in manage-revisions.test.ts.
import { mock } from 'node:test';
import path from 'path';

import * as realClickParser from '../utils/click-parser-async';
// Capture the real implementations before replacing the modules, so tests that need real
// behavior can fall back to it via mockImplementation.
import * as realReviewPackage from '../utils/review-package';

const cwd = process.cwd();

type ReviewClickFn = (...args: Parameters<typeof realReviewPackage.clickReview>) => Promise<unknown>;
type ParseClickPackageFn = (...args: Parameters<typeof realClickParser.parseClickPackage>) => Promise<unknown>;

export const clickReviewMock = mock.fn<ReviewClickFn>(realReviewPackage.clickReview);

export const parseClickPackageMock = mock.fn<ParseClickPackageFn>(realClickParser.parseClickPackage);

export function resetManageRevisionMocks() {
  clickReviewMock.mock.resetCalls();
  parseClickPackageMock.mock.resetCalls();
  clickReviewMock.mock.mockImplementation(realReviewPackage.clickReview);
  parseClickPackageMock.mock.mockImplementation(realClickParser.parseClickPackage);
}

mock.module(path.resolve(cwd, 'src/utils/review-package.ts'), {
  namedExports: { clickReview: clickReviewMock },
});
mock.module(path.resolve(cwd, 'src/utils/click-parser-async.ts'), {
  namedExports: { parseClickPackage: parseClickPackageMock },
});
