import { connect } from 'mongoose';
import { config } from '../utils';
import { PackageSearch as ElasticsearchPackageSearch } from '../db/package/search';
import { PackageSearch as MeilisearchPackageSearch } from '../db/package/search-meilisearch';
import type { PackageRequestFilters } from '../db/package/types';

const elasticsearchSearch = new ElasticsearchPackageSearch();
const meilisearchSearch = new MeilisearchPackageSearch();

async function compareSearch(query: string, filters: Partial<PackageRequestFilters> = {}) {
  try {
    console.log(`Comparing search results for query: "${query}"`);
    console.log('Filters:', filters);

    const searchFilters: PackageRequestFilters = {
      search: query,
      ...filters,
    };

    console.log('\nElasticsearch results:');
    const esStart = Date.now();
    const esResults = await elasticsearchSearch.search(searchFilters);
    const esDuration = Date.now() - esStart;
    console.log(`Found ${String(esResults.body.hits.total.value)} results in ${String(esDuration)}ms`);

    console.log('\nMeilisearch results:');
    const msStart = Date.now();
    const msResults = await meilisearchSearch.search(searchFilters);
    const msDuration = Date.now() - msStart;
    console.log(`Found ${String(msResults.estimatedTotalHits)} results in ${String(msDuration)}ms`);

    // Compare top 5 results
    console.log('\nTop 5 results comparison:');
    console.log('Elasticsearch | Meilisearch');
    console.log('------------- | ------------');

    for (let i = 0; i < 5; i++) {
      const esResult = esResults.body.hits.hits[i]?._source?.name || '-';
      const msResult = msResults.hits[i]?.name || '-';
      console.log(`${String(esResult).padEnd(13)} | ${String(msResult)}`);
    }

    process.exit(0);
  }
  catch (error) {
    console.error('Comparison failed:', error);
    process.exit(1);
  }
}

// Simple CLI argument parsing
async function main() {
  await connect(config.mongo.uri);

  const query = process.argv[2] || '';
  if (!query) {
    console.error('Usage: node search-compare.js "search query" [category] [channel]');
    process.exit(1);
  }

  const filters: Partial<PackageRequestFilters> = {};

  if (process.argv[3]) {
    filters.category = process.argv[3];
  }

  if (process.argv[4]) {
    // Cast to Channel type since we're receiving it as a command line argument
    filters.channel = process.argv[4] as any;
  }

  await compareSearch(query, filters);
}

void main();
