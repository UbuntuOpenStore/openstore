// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PackageSearchInterface } from './search-interface';
import { PackageSearch } from './search-meilisearch';

export function getSearchImplementation(): PackageSearchInterface {
  return new PackageSearch();
}

export const packageSearchInstance = getSearchImplementation();
