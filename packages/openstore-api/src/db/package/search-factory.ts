import type { PackageSearchInterface } from './search-interface';
import { PackageSearch } from './search-meilisearch';

export function getSearchImplementation(): PackageSearchInterface {
  return new PackageSearch();
}

export const packageSearchInstance = getSearchImplementation();
