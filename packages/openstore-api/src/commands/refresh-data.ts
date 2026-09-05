#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later

import 'db'; // Make sure the database connection gets setup
import { type FilterQuery } from 'mongoose';

import { Package } from '../db/package';
import { type IPackage } from '../db/package/types';

const query: FilterQuery<IPackage> = {};
if (process.argv[3]) {
  query.id = process.argv[3];
}

const CONCURRENCY = 10;

async function refreshData() {
  const cursor = Package.find(query).cursor({ batchSize: 100 });
  const activeTasks = new Set<Promise<void>>();

  for await (const pkg of cursor) {
    const task = (async () => {
      console.log(`processing ${pkg.id as string}`);

      await pkg.updateFromBody({ screenshots: pkg.screenshots });
      pkg.updateCalculatedProperties();

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

refreshData()
  .then(() => {
    console.log('done');
    process.exit(0);
  })
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
