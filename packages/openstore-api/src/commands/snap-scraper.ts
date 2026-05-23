import 'db'; // Make sure the database connection gets setup
import { type HydratedPackage, Package } from '../db/package';
import { PackageSearch as MeilisearchPackageSearch } from '../db/package/search-meilisearch';
import { fetchSnapDetailsV2, transformSnapToPackage, discoverSnaps, searchSnaps, sleep } from '../utils/snap-scraper';

const DELAY_BETWEEN_REQUESTS = 150;

const meilisearchSearch = new MeilisearchPackageSearch();

async function syncSnapPackages(options: { search?: string; force?: boolean } = {}) {
  console.log('Starting snap package sync...');
  let totalSynced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  try {
    const snaps = options.search
      ? await searchSnaps(options.search)
      : await discoverSnaps();
    console.log(`Found ${snaps.length} snaps to process`);

    for (const snapName of snaps) {
      try {
        console.log(`Processing snap: ${snapName}`);

        const snapId = `snap.${snapName}`;
        const existingPackage = await Package.findOne({ id: snapId });

        const v2Data = await fetchSnapDetailsV2(snapName);
        await sleep(DELAY_BETWEEN_REQUESTS);

        const packageData = transformSnapToPackage(v2Data);

        let savedPackage: HydratedPackage;
        if (existingPackage) {
          const latestStableRevision = v2Data['channel-map'].find((cm) => cm.channel.risk === 'stable');
          const existingLatestRevision = existingPackage.revisions[existingPackage.revisions.length - 1];

          if (
            !options.force &&
            latestStableRevision &&
            existingLatestRevision &&
            latestStableRevision.version === existingLatestRevision.version
          ) {
            console.log(`  Skipped (already up to date): ${snapName}`);
            totalSkipped++;
            continue;
          }

          Object.assign(existingPackage, packageData);
          savedPackage = await existingPackage.save();
          console.log(`  Updated: ${snapName}`);
        } else {
          savedPackage = await Package.create(packageData);
          console.log(`  Created: ${snapName}`);
        }

        await meilisearchSearch.upsert(savedPackage);
        console.log(`  Indexed in Meilisearch: ${snapName}`);

        totalSynced++;
      } catch (error) {
        console.error(`Error processing snap ${snapName}:`, error);
        totalErrors++;
      }
    }

    console.log('\n=== Sync Complete ===');
    console.log(`Total synced: ${totalSynced}`);
    console.log(`Total skipped: ${totalSkipped}`);
    console.log(`Total errors: ${totalErrors}`);
    process.exit(0);
  } catch (error) {
    console.error('Fatal error during sync:', error);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const options: { search?: string; force?: boolean } = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--search' && args[i + 1]) {
    options.search = args[i + 1];
    i++;
  } else if (args[i] === '--force') {
    options.force = true;
  }
}

void syncSnapPackages(options);
