import 'db'; // Make sure the database connection gets setup
import { Package } from '../db/package';
import { Review } from '../db/review';

async function backfillReviewPackageIds() {
  const totalCount = await Review.countDocuments({});
  const missingCount = await Review.countDocuments({ package_id: { $exists: false } });
  console.log(`Total reviews: ${totalCount}, missing package_id: ${missingCount}`);

  const CONCURRENCY = 10;
  const cursor = Review.find({ package_id: { $exists: false } }).cursor({ batchSize: 100 });
  const activeTasks = new Set<Promise<void>>();
  let updatedCount = 0;

  for await (const review of cursor) {
    const task = (async () => {
      const pkg = await Package.findById(review.pkg);
      if (!pkg) {
        console.log(`Could not find package ${String(review.pkg)} for review ${String(review._id)}`);
        return;
      }

      review.package_id = pkg.id;
      await review.save();
      updatedCount++;
      console.log(`Set package_id=${pkg.id} on review ${String(review._id)}`);
    })();

    activeTasks.add(task);

    if (activeTasks.size >= CONCURRENCY) {
      await Promise.all(activeTasks);
      activeTasks.clear();
    }
  }

  await Promise.all(activeTasks);

  const remainingCount = await Review.countDocuments({ package_id: { $exists: false } });
  console.log(`\nDone. Updated: ${updatedCount}, still missing: ${remainingCount}`);
  process.exit(0);
}

backfillReviewPackageIds().catch((err) => {
  console.log(err);
  process.exit(1);
});
