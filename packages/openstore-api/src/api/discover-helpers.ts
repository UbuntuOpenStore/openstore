// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'fs/promises';
import path from 'path';

import shuffle from 'shuffle-array';

import { Package } from '../db/package';
import { serializeRatings } from '../db/package/methods';
import { Architecture, type Channel, AppType, type PackageType, type HydratedPackage } from '../db/package/types';
import { RatingCount } from '../db/rating_count';
import { config, gettext, setLang } from '../utils';
import type { DiscoverData } from './types';

export const CACHE_DIR = path.join(config.cache_dir, 'discover');
export const CACHE_DURATION_MS = 600000; // 10 minutes

const NEW_AND_UPDATED = 'New and Updated Apps';
const POPULAR = 'Most Loved';

export type CachedData<T> = {
  data: T;
  timestamp: number;
  frameworks: string[];
};

export async function getCachedData<T>(cacheKey: string): Promise<CachedData<T> | null> {
  try {
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
    const content = await fs.readFile(cacheFile, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Cache miss or read error
    return null;
  }
}

export async function setCachedData<T>(cacheKey: string, data: T, frameworks: string[]): Promise<void> {
  try {
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
    const cachedData: CachedData<T> = {
      data,
      timestamp: Date.now(),
      frameworks,
    };
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(cachedData), 'utf-8');
  } catch (error) {
    console.error('Failed to write cache file:', error);
  }
}

export async function getHighlights<TApp, TExtra extends Record<string, unknown>>(
  highlights: Array<{ id: string; description: string }>,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  packageTypes: PackageType[],
  serializeHighlight: (app: HydratedPackage) => { image: string | null; app: TApp } & TExtra,
): Promise<Array<{ id: string; description: string; image: string; app: TApp } & TExtra>> {
  const found = await Package.findByFilters({
    ids: highlights.map((highlight) => highlight.id),
    channel,
    architectures: [architecture, Architecture.ALL],
    frameworks,
    published: true,
    packageTypes,
  });

  return shuffle(
    highlights
      .map((highlight) => {
        const highlightedApp = found.find((app) => app.id === highlight.id);

        if (!highlightedApp) {
          return null;
        }

        const body = serializeHighlight(highlightedApp);
        if (!body.image) {
          return null;
        }

        return { id: highlight.id, description: highlight.description, ...body };
      })
      .filter((highlight): highlight is { id: string; description: string; image: string; app: TApp } & TExtra => !!highlight),
  );
}

export async function getCategoryApps<TApp>(
  categories: Array<{ name: string; tagline: string; referral: string; ids: string[] }>,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  packageTypes: PackageType[],
  serializeApp: (app: HydratedPackage) => TApp,
): Promise<Array<{ name: string; tagline: string; referral: string; ids: string[]; apps: TApp[] }>> {
  const filteredCategories = shuffle(categories).slice(0, 3);

  const allCategories = [
    {
      name: NEW_AND_UPDATED,
      tagline: 'Exciting new apps & updates',
      referral: '',
      ids: [],
    },
    ...filteredCategories,
    {
      name: POPULAR,
      tagline: 'Apps with the highest ratings',
      referral: '',
      ids: [],
    },
  ];

  const discoverCategoriesApps = await Promise.all(
    allCategories.map(async (category) => {
      if (category.ids.length === 0) {
        return [];
      }

      return Package.findByFilters({
        ids: category.ids,
        channel,
        architectures: [architecture, Architecture.ALL],
        frameworks,
        published: true,
        packageTypes,
      });
    }),
  );

  return allCategories.map((category, index) => ({
    name: category.name,
    tagline: category.tagline,
    referral: category.referral,
    ids: shuffle(category.ids),
    apps: shuffle(discoverCategoriesApps[index].map((app) => serializeApp(app))),
  }));
}

export async function getNewAndUpdatedApps<TApp>(
  categories: Array<{ name: string; apps: TApp[] }>,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  packageTypes: PackageType[],
  serializeApp: (app: HydratedPackage) => TApp,
): Promise<void> {
  const [newApps, updatedApps] = await Promise.all([
    Package.findByFilters(
      {
        published: true,
        channel,
        architectures: [architecture, Architecture.ALL],
        frameworks,
        nsfw: [null, false],
        types: [AppType.APP],
        packageTypes,
      },
      '-published_date',
      8,
    ),
    Package.findByFilters(
      {
        published: true,
        channel,
        architectures: [architecture, Architecture.ALL],
        frameworks,
        nsfw: [null, false],
        types: [AppType.APP],
        packageTypes,
      },
      '-updated_date',
      8,
    ),
  ]);

  let newAndUpdatedApps = newApps.concat(updatedApps);
  newAndUpdatedApps = newAndUpdatedApps.filter((app, pos) => {
    return newAndUpdatedApps.findIndex((a) => a.id === app.id) === pos;
  });

  newAndUpdatedApps.sort((a, b) => {
    if (a.updated_date! > b.updated_date!) {
      return -1;
    }

    if (a.updated_date! < b.updated_date!) {
      return 1;
    }

    return 0;
  });

  const category = categories.find((c) => c.name === NEW_AND_UPDATED);
  category!.apps = newAndUpdatedApps.slice(0, 10).map((app) => serializeApp(app));
}

export async function getPopularApps<TApp>(
  categories: Array<{ name: string; apps: TApp[] }>,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  packageTypes: PackageType[],
  serializeApp: (app: HydratedPackage) => TApp,
): Promise<void> {
  const popularApps = await Package.findByFilters(
    {
      published: true,
      channel,
      architectures: [architecture, Architecture.ALL],
      frameworks,
      nsfw: [null, false],
      types: [AppType.APP],
      packageTypes,
    },
    '-calculated_rating',
    8,
  );

  const category = categories.find((c) => c.name === POPULAR);
  category!.apps = popularApps.map((app) => serializeApp(app));
}

export async function refreshRatings(discover: DiscoverData) {
  const ids = new Set<string>();
  for (const highlight of discover.highlights) {
    ids.add(highlight.id);
  }
  for (const category of discover.categories) {
    for (const id of category.ids) {
      ids.add(id);
    }
  }

  const ratingCounts = await RatingCount.getCountsByIds(Array.from(ids));

  for (const highlight of discover.highlights) {
    highlight.app.ratings = serializeRatings(ratingCounts[highlight.id]);
  }

  for (const category of discover.categories) {
    for (const app of category.apps) {
      app.ratings = serializeRatings(ratingCounts[app.id]);
    }
  }
}

export function translateDiscover<T extends { categories: Array<{ name: string; tagline?: string }> }>(lang: string, discover: T): T {
  setLang(lang);

  for (const category of discover.categories) {
    category.name = gettext(category.name);
    category.tagline = category.tagline ? gettext(category.tagline) : '';
  }

  return discover;
}
