#!/usr/bin/env node

import 'db'; // Make sure the database connection gets setup
import { type FilterQuery } from 'mongoose';

import { Package } from '../db/package';
import { type IPackage } from '../db/package/types';
import { recalculatePackageRatings } from '../db/rating_count/utils';

const query: FilterQuery<IPackage> = {};
if (process.argv[3]) {
  query.id = process.argv[3];
}

async function updateCalculated() {
  const CONCURRENCY = 10;
  const cursor = Package.find(query).cursor({ batchSize: 100 });
  const activeTasks = new Set<Promise<void>>();

  for await (const pkg of cursor) {
    const task = (async () => {
      console.log(pkg.id);
      pkg.updateCalculatedProperties();
      await recalculatePackageRatings(pkg.id);

      await pkg.save();
    })();

    activeTasks.add(task);

    if (activeTasks.size >= CONCURRENCY) {
      console.log(`Processing batch of ${activeTasks.size} packages...`);
      await Promise.all(activeTasks);
      activeTasks.clear();
    }
  }

  await Promise.all(activeTasks);
}

updateCalculated()
  .then(() => {
    console.log('done');
    process.exit(0);
  })
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
