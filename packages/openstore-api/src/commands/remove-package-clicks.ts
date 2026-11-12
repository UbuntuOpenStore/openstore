#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from 'fs';
import path from 'path';

import 'db'; // Make sure the database connection gets setup

import { Package } from '../db/package';
import { config } from '../utils';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const DRY_RUN = args.includes('--dry-run');
const packageId = args.find((arg) => !arg.startsWith('--'));

if (!packageId) {
  console.log('Usage: remove-package-clicks <package-id> [--dry-run]');
  process.exit(1);
}

if (DRY_RUN) {
  console.log('Running in DRY RUN mode - no files will be deleted and no database changes will be made');
}

const clickFilePrefix = `${packageId}-`;

function findClickFiles(): string[] {
  return fs
    .readdirSync(config.data_dir)
    .filter((file) => file.startsWith(clickFilePrefix) && file.endsWith('.click'))
    .map((file) => path.join(config.data_dir, file));
}

function matchesDownloadUrl(file: string, downloadUrl: string): boolean {
  // TODO make a script to update everything to the new path
  // /srv/openstore-data is a symlink to /srv/data/openstore-data
  return downloadUrl === file || downloadUrl === file.replace('/data/', '/');
}

async function removePackageClicks() {
  const clickFiles = findClickFiles();

  if (clickFiles.length === 0) {
    console.log(`[${packageId}] no click files found`);
  }

  for (const file of clickFiles) {
    console.log(`[${packageId}] ${DRY_RUN ? '[DRY RUN] would remove' : 'removing'} ${file}`);

    if (!DRY_RUN) {
      fs.unlinkSync(file);
    }
  }

  const pkg = await Package.findOne({ id: packageId });
  if (!pkg) {
    console.log(`[${packageId}] no package found in the database`);
    return;
  }

  let updated = false;
  for (const revision of pkg.revisions) {
    const downloadUrl = revision.download_url;
    if (!downloadUrl) {
      continue;
    }

    const isTargetedFile = clickFiles.some((file) => matchesDownloadUrl(file, downloadUrl));
    if (!isTargetedFile && fs.existsSync(downloadUrl)) {
      continue;
    }

    console.log(`[${packageId}] ${DRY_RUN ? '[DRY RUN] would clear' : 'clearing'} download_url for revision ${revision.revision}`);

    if (!DRY_RUN) {
      revision.download_url = null;
      updated = true;
    }
  }

  if (!DRY_RUN && updated) {
    pkg.updateCalculatedProperties();
    await pkg.save();
  }
}

removePackageClicks()
  .then(() => {
    console.log(`done removing click files for ${packageId}`);
    process.exit(0);
  })
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
