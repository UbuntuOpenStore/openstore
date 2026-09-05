// SPDX-License-Identifier: AGPL-3.0-or-later
import { PackageSearch as MeilisearchPackageSearch } from '../db/package/search-meilisearch';

const meilisearchSearch = new MeilisearchPackageSearch();

async function init() {
  try {
    console.log('Creating Meilisearch index...');
    await meilisearchSearch.removeIndex().catch(() => {
      console.log('Index did not exist, creating new one');
    });
    await meilisearchSearch.createIndex();
    console.log('Successfully created Meilisearch index');
    process.exit(0);
  } catch (error) {
    console.error('Failed to create index:', error);
    process.exit(1);
  }
}

void init();
