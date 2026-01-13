import 'db'; // Make sure the database connection gets setup
import { Package } from '../db/package';
import {
  fetchSnaps,
  fetchSnapDetailsV2,
  fetchSnapDetailsV1,
  transformSnapToPackage,
  discoverSnaps,
  sleep,
  type SnapV1Response,
} from '../utils/snap-scraper';

const DELAY_BETWEEN_REQUESTS = 150;

async function syncSnapPackages(options: { limit?: number; search?: string; force?: boolean } = {}) {
  console.log('Starting snap package sync...');
  let totalSynced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  try {
    const snaps = options.search
      ? await fetchSnaps(options.search, options.limit)
      : await discoverSnaps(options.limit);
    console.log(`Found ${snaps.length} snaps to process`);

    for (const snap of snaps) {
      try {
        console.log(`Processing snap: ${snap.name}`);

        const snapId = `snap.${snap.name}`;
        const existingPackage = await Package.findOne({ id: snapId });

        const v2Data = await fetchSnapDetailsV2(snap.name);
        await sleep(DELAY_BETWEEN_REQUESTS);

        let v1Data: SnapV1Response | null = null;
        try {
          v1Data = await fetchSnapDetailsV1(snap.name);
          await sleep(DELAY_BETWEEN_REQUESTS);
        }
        catch (error) {
          console.warn(`  Warning: v1 API not available for ${snap.name}, using v2 data only`);
        }

        const category = v1Data?.links?.website ? 'utilities' : 'utilities';
        const packageData = transformSnapToPackage(v2Data, v1Data, category);

        if (existingPackage) {
          const latestStableRevision = v2Data['channel-map'].find((cm) => cm.channel.risk === 'stable');
          const existingLatestRevision = existingPackage.revisions[existingPackage.revisions.length - 1];

          if (
            !options.force &&
            latestStableRevision &&
            existingLatestRevision &&
            latestStableRevision.version === existingLatestRevision.version
          ) {
            console.log(`  Skipped (already up to date): ${snap.name}`);
            totalSkipped++;
            continue;
          }

          Object.assign(existingPackage, packageData);
          await existingPackage.save();
          console.log(`  Updated: ${snap.name}`);
        }
        else {
          await Package.create(packageData);
          console.log(`  Created: ${snap.name}`);
        }

        totalSynced++;
      }
      catch (error) {
        console.error(`Error processing snap ${snap.name}:`, error);
        totalErrors++;
      }
    }

    console.log('\n=== Sync Complete ===');
    console.log(`Total synced: ${totalSynced}`);
    console.log(`Total skipped: ${totalSkipped}`);
    console.log(`Total errors: ${totalErrors}`);
    process.exit(0);
  }
  catch (error) {
    console.error('Fatal error during sync:', error);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const options: { limit?: number; search?: string; force?: boolean } = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1], 10);
    i++;
  }
  else if (args[i] === '--search' && args[i + 1]) {
    options.search = args[i + 1];
    i++;
  }
  else if (args[i] === '--force') {
    options.force = true;
  }
}

void syncSnapPackages(options);
