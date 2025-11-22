#!/usr/bin/env node

import '../db'; // Make sure the database connection gets setup
import { Discover } from '../db/discover';
import fs from 'fs/promises';
import path from 'path';

const DISCOVER_JSON_PATH = path.join(__dirname, '../api/json/discover_apps.json');

async function migrateDiscoverData() {
  try {
    const jsonContent = await fs.readFile(DISCOVER_JSON_PATH, 'utf-8');
    const discoverData = JSON.parse(jsonContent);

    const result = await Discover.updateDiscoverData(
      discoverData.highlights,
      discoverData.categories,
    );

    console.log('Discover data successfully migrated to database!');
    console.log(`- Highlights: ${result.highlights.length}`);
    console.log(`- Categories: ${result.categories.length}`);

    process.exit(0);
  }
  catch (err) {
    console.error('Error migrating discover data:', err);
    process.exit(1);
  }
}

void migrateDiscoverData();
