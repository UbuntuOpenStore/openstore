import 'db'; // Make sure the database connection gets setup
import { Package } from '../db/package';
import { PackageSearch as MeilisearchPackageSearch } from '../db/package/search-meilisearch';
import { recalculatePackageRatings } from '../db/rating_count/utils';

const meilisearchSearch = new MeilisearchPackageSearch();

async function reindex() {
  try {
    console.log('Fetching packages from MongoDB...');
    const packages = await Package.find({ published: true }).exec();
    console.log(`Found ${packages.length} packages to index`);

    console.log('Recalculating package ratings...');
    for (const pkg of packages) {
      await recalculatePackageRatings(pkg._id);
    }

    console.log('Reinitializing Meilisearch index...');
    await meilisearchSearch.removeIndex().catch(() => {
      console.log('Index did not exist, creating new one');
    });
    await meilisearchSearch.createIndex();

    console.log('Indexing packages in batches...');
    const BATCH_SIZE = 100;
    for (let i = 0; i < packages.length; i += BATCH_SIZE) {
      const batch = packages.slice(i, i + BATCH_SIZE);
      await meilisearchSearch.bulk(batch);
      console.log(`Indexed batch ${i / BATCH_SIZE + 1} of ${Math.ceil(packages.length / BATCH_SIZE)}`);
    }

    console.log('Reindexing complete!');
    process.exit(0);
  }
  catch (error) {
    console.error('Failed to reindex:', error);
    process.exit(1);
  }
}

void reindex();
