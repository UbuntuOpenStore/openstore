import 'db';
import { Package } from '../db/package';
import { PackageType } from '../db/package/types';

async function backfillLomiriCompatible() {
  console.log('Backfilling lomiri_compatible...');

  const totalCount = await Package.countDocuments({});
  console.log(`Total packages: ${totalCount}`);

  // set all packages to false (clears any existing values)
  let result = await Package.updateMany({}, { $set: { lomiri_compatible: false } });
  console.log(`Default false: Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);

  const clickCount = await Package.countDocuments({ package_type: PackageType.CLICK });
  if (clickCount > 0) {
    result = await Package.updateMany({ package_type: PackageType.CLICK }, { $set: { lomiri_compatible: true } });
    console.log(`Clicks (true): Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
  }

  const snapMatchCount = await Package.countDocuments({
    package_type: PackageType.SNAP,
    revisions: {
      $elemMatch: {
        'snap_data.grade': 'stable',
        'snap_data.connections': {
          $elemMatch: { name: 'lomiri-ui-toolkit' },
        },
      },
    },
  });
  if (snapMatchCount > 0) {
    result = await Package.updateMany(
      {
        package_type: PackageType.SNAP,
        revisions: {
          $elemMatch: {
            'snap_data.grade': 'stable',
            'snap_data.connections': {
              $elemMatch: { name: 'lomiri-ui-toolkit' },
            },
          },
        },
      },
      { $set: { lomiri_compatible: true } },
    );
    console.log(`Snaps with lomiri-ui-toolkit (true): Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
  }

  const trueCount = await Package.countDocuments({ lomiri_compatible: true });
  const falseCount = await Package.countDocuments({ lomiri_compatible: false });
  console.log(`\nDone. lomiri_compatible: true=${trueCount}, false=${falseCount}`);
  process.exit(0);
}

void backfillLomiriCompatible();
