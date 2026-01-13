/**
 * Migration script to add source_store and package_type to existing packages
 * This should be run once to migrate existing click packages before importing snaps
 */

import 'db'; // Make sure the database connection gets setup
import { Package } from '../db/package';
import { PackageType, SourceStore } from '../db/package/types';

async function migratePackages() {
  console.log('Starting package migration...');

  try {
    const packagesNeedingMigration = await Package.countDocuments({
      $or: [
        { source_store: { $exists: false } },
        { package_type: { $exists: false } },
      ],
    });

    console.log(`Found ${packagesNeedingMigration} packages needing migration`);

    if (packagesNeedingMigration === 0) {
      console.log('No packages need migration. All done!');
      process.exit(0);
    }

    const result = await Package.updateMany(
      {
        $or: [
          { source_store: { $exists: false } },
          { package_type: { $exists: false } },
        ],
      },
      {
        $set: {
          source_store: SourceStore.OPENSTORE,
          package_type: PackageType.CLICK,
        },
      },
    );

    console.log('Migration complete:');
    console.log(`  - Matched: ${result.matchedCount} packages`);
    console.log(`  - Modified: ${result.modifiedCount} packages`);

    const remainingPackages = await Package.countDocuments({
      $or: [
        { source_store: { $exists: false } },
        { package_type: { $exists: false } },
      ],
    });

    if (remainingPackages > 0) {
      console.warn(`Warning: ${remainingPackages} packages still need migration`);
      process.exit(1);
    }

    const clickCount = await Package.countDocuments({ package_type: PackageType.CLICK });
    const snapCount = await Package.countDocuments({ package_type: PackageType.SNAP });
    const totalCount = await Package.countDocuments({});

    console.log('\nPackage summary:');
    console.log(`  - Click packages: ${clickCount}`);
    console.log(`  - Snap packages: ${snapCount}`);
    console.log(`  - Total packages: ${totalCount}`);

    console.log('\nMigration successful!');
    process.exit(0);
  }
  catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

void migratePackages();
