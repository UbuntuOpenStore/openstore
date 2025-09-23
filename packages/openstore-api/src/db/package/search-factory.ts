import { config, logger } from '../../utils';
import { PackageSearch as ElasticsearchPackageSearch } from './search';
import { PackageSearch as MeilisearchPackageSearch } from './search-meilisearch';
import type { PackageSearchInterface } from './search-interface';

export function getSearchImplementation(): PackageSearchInterface {
  logger.debug(`Using search provider: ${config.searchProvider}`);

  if (config.searchProvider === 'meilisearch') {
    return new MeilisearchPackageSearch();
  }

  return new ElasticsearchPackageSearch();
}

export const packageSearchInstance = getSearchImplementation();
