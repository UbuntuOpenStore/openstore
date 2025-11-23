#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { po } from 'gettext-parser';
import categoryIcons from '../api/json/category_icons.json';
import '../db'; // Make sure the database connection gets setup
import { Discover } from '../db/discover';

async function updatePotFile() {
  let strings = Object.keys(categoryIcons);
  strings.push('Download from the');
  strings.push('');

  // Get discover data from database
  const discoverData = await Discover.getDiscoverData();
  if (discoverData) {
    strings = strings.concat(discoverData.categories.flatMap((category) => {
      const categoryStrings = [category.name];
      if (category.tagline) {
        categoryStrings.push(category.tagline);
      }

      return categoryStrings;
    }));
  }

  const potFileName = path.join(__dirname, '../../po/openstore-web.pot');
  const potContent = fs.readFileSync(potFileName, 'utf-8');
  const potFile = po.parse(potContent);

  // Clean up old translations - Don't do this as we might bring back categories again
  /*
  Object.keys(potFile.translations['']).forEach((key) => {
      if (!strings.includes(key)) {
          delete potFile.translations[''][key];
      }
  });
  */

  if (discoverData) {
    discoverData.categories.forEach((category) => {
      potFile.translations[''][category.name] = {
        msgid: category.name,
        msgstr: [''],
        comments: {
          translator: 'Discovery section category name',
        } as any, // TODO fix type
      };

      if (category.tagline) {
        potFile.translations[''][category.tagline] = {
          msgid: category.tagline,
          msgstr: [''],
          comments: {
            translator: `Discovery section category tagline for "${category.name}"`,
          } as any, // TODO fix type
        };
      }
    });
  }

  const output = po.compile(potFile);
  fs.writeFileSync(potFileName, output);

  console.log('Updated the pot file');
  process.exit(0);
}

void updatePotFile();
