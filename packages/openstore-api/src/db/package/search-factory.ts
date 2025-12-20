import { PackageSearch } from './search-meilisearch';
import type { PackageSearchInterface } from './search-interface';

export function getSearchImplementation(): PackageSearchInterface {
  return new PackageSearch();
}

export const packageSearchInstance = getSearchImplementation();
