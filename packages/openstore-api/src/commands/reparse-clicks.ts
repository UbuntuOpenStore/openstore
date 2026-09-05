#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later

import { existsSync } from 'fs';
import fs from 'fs/promises';

import 'db'; // Make sure the database connection gets setup
import { type FilterQuery } from 'mongoose';

import { type IPackage, Package, extractPathsFromClickData } from '../db/package';
import { sha512Checksum } from '../utils';
import * as clickParser from '../utils/click-parser-async';

const query: FilterQuery<IPackage> = {};
if (process.argv[3]) {
  query.id = process.argv[3];
}

async function reparseClicks() {
  const CONCURRENCY = 10;
  const cursor = Package.find(query).cursor({ batchSize: 100 });
  const activeTasks = new Set<Promise<void>>();

  for await (const pkg of cursor) {
    const task = (async () => {
      let updatedCount = 0;

      for (const revision of pkg.revisions) {
        if (revision.download_url && existsSync(revision.download_url)) {
          console.log(`Parsing ${String(pkg.id)} revision ${revision.revision}`);

          const parseData = await clickParser.parseClickPackage(revision.download_url, false);
          const downloadSha512 = await sha512Checksum(revision.download_url);
          const downloadSize = (await fs.stat(revision.download_url)).size;
          const { readPaths, writePaths } = extractPathsFromClickData(parseData);

          pkg.updateRevision(
            revision.revision,
            parseData.framework ?? '',
            revision.download_url,
            downloadSha512,
            parseData.installedSize ?? 0,
            downloadSize,
            parseData.permissions,
            readPaths,
            writePaths,
            parseData.apps.filter((app) => app.type === 'app').map((app) => app.name),
          );

          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        // Update package-level data from the latest revision
        let latestRevision = pkg.revisions[0];
        for (const rev of pkg.revisions) {
          if (rev.revision > latestRevision.revision) {
            latestRevision = rev;
          }
        }

        if (latestRevision.download_url && existsSync(latestRevision.download_url)) {
          const parseData = await clickParser.parseClickPackage(latestRevision.download_url, false);
          await pkg.updateFromClick(parseData);
        }

        console.log(`Saving ${String(pkg.id)} (updated ${updatedCount} revisions)`);
        await pkg.save();
      }
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

reparseClicks()
  .then(() => {
    console.log('done');
    process.exit(0);
  })
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
