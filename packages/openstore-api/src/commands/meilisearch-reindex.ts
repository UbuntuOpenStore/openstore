import 'db'; // Make sure the database connection gets setup
import { Package } from '../db/package';
import { PackageSearch as MeilisearchPackageSearch } from '../db/package/search-meilisearch';
import type { HydratedPackage } from '../db/package/types';
import { recalculatePackageRatings } from '../db/rating_count/utils';

const meilisearchSearch = new MeilisearchPackageSearch();

async function reindex() {
  try {
    const filter = { published: true };
    const BATCH_SIZE = 100;

    const totalPackages = await Package.countDocuments(filter);
    console.log(`Found ${totalPackages} packages to index`);

    console.log('Reinitializing Meilisearch index...');
    await meilisearchSearch.removeIndex().catch(() => {
      console.log('Index did not exist, creating new one');
    });
    await meilisearchSearch.createIndex();

    console.log('Recalculating ratings and indexing packages in batches...');
    const cursor = Package.find(filter).cursor({ batchSize: BATCH_SIZE });
    const batch: HydratedPackage[] = [];
    let indexedCount = 0;
    let batchNumber = 0;
    const totalBatches = Math.ceil(totalPackages / BATCH_SIZE);

    for await (const pkg of cursor) {
      if (pkg.revisions.length === 0) {
        continue;
      }

      await recalculatePackageRatings(pkg._id);
      batch.push(pkg);

      if (batch.length < BATCH_SIZE) {
        continue;
      }

      await meilisearchSearch.bulk(batch);
      indexedCount += batch.length;
      batchNumber += 1;
      console.log(`Indexed batch ${batchNumber} of ${totalBatches} (${indexedCount}/${totalPackages})`);
      batch.length = 0;
    }

    if (batch.length > 0) {
      await meilisearchSearch.bulk(batch);
      indexedCount += batch.length;
      batchNumber += 1;
      console.log(`Indexed batch ${batchNumber} of ${totalBatches} (${indexedCount}/${totalPackages})`);
    }

    console.log('Reindexing complete!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to reindex:', error);
    process.exit(1);
  }
}

void reindex();
