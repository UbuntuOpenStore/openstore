import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import express, { type Request, type Response } from 'express';
/* eslint-disable no-param-reassign */
import shuffle from 'shuffle-array';

import { Discover } from '../db/discover';
import { Package } from '../db/package';
import { serializeRatings } from '../db/package/methods';
import { Architecture, type Channel, AppType, PackageType } from '../db/package/types';
import { RatingCount } from '../db/rating_count';
import { success, getData, getDataArray, setLang, gettext, asyncErrorWrapper } from '../utils';
import { handleChannel } from '../utils/channels';
import { config } from '../utils/config';
import { type DiscoverHighlight, type DiscoverCategory, type DiscoverData } from './types';

const router = express.Router();

const CACHE_DIR = path.join(config.cache_dir, 'discover');
const CACHE_DURATION_MS = 600000; // 10 minutes

type CachedData = {
  data: DiscoverData;
  timestamp: number;
  frameworks: string[];
};

async function getCachedData(cacheKey: string): Promise<CachedData | null> {
  try {
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
    const content = await fs.readFile(cacheFile, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Cache miss or read error
    return null;
  }
}

async function setCachedData(cacheKey: string, data: DiscoverData, frameworks: string[]): Promise<void> {
  try {
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
    const cachedData: CachedData = {
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

const NEW_AND_UPDATED = 'New and Updated Apps';
const POPULAR = 'Most Loved';

/**
 * Set the highlighted app list in the discover data
 */
async function getHighlights(
  discover: DiscoverData,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  apiVersion?: number,
) {
  const highlights = await Package.findByFilters({
    ids: discover.highlights.map((highlight) => highlight.id),
    channel,
    architectures: [architecture, Architecture.ALL],
    frameworks,
    published: true,
    packageTypes: [PackageType.CLICK],
  });

  discover.highlights = shuffle(
    discover.highlights
      .map((highlight) => {
        const highlightedApp = highlights.find((app) => app.id === highlight.id);

        if (!highlightedApp) {
          return null;
        }

        const serializedApp = highlightedApp.serialize(architecture, channel, frameworks, apiVersion);

        return {
          ...highlight,
          image: serializedApp.banner,
          app: serializedApp,
        };
      })
      .filter((highlight): highlight is DiscoverHighlight => !!highlight && !!highlight.image),
  );

  // Deprecated, for backwards compatibility
  discover.highlight = discover.highlights[0];
}

/**
 * Set the new and updated in the discover data.
 */
async function getNewAndUpdatedApps(
  discover: DiscoverData,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  apiVersion?: number,
) {
  const [newApps, updatedApps] = await Promise.all([
    Package.findByFilters(
      {
        published: true,
        channel,
        architectures: [architecture, Architecture.ALL],
        frameworks,
        nsfw: [null, false],
        types: [AppType.APP],
        packageTypes: [PackageType.CLICK],
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
        packageTypes: [PackageType.CLICK],
      },
      '-updated_date',
      8,
    ),
  ]);

  const newAndUpdatedCategory = discover.categories.find((category) => category.name === NEW_AND_UPDATED);

  // Get the 10 latest updated or published apps
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

  newAndUpdatedCategory!.apps = newAndUpdatedApps.slice(0, 10).map((app) => app.serialize(architecture, channel, frameworks, apiVersion));
}

/**
 * Set the apps in the categories in the discover data.
 */
async function getCategoryApps(
  discover: DiscoverData,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  apiVersion?: number,
) {
  const filteredCategories = shuffle(discover.categories).slice(0, 3);

  const categories = [
    {
      name: 'New and Updated Apps',
      tagline: 'Exciting new apps & updates',
      referral: '',
      ids: [],
    },
    ...filteredCategories,
    {
      name: 'Most Loved',
      tagline: 'Apps with the highest ratings',
      referral: '',
      ids: [],
    },
  ];

  const discoverCategoriesApps = await Promise.all(
    categories.map(async (category) => {
      if (category.ids.length === 0) {
        return [];
      }

      return Package.findByFilters({
        ids: category.ids,
        channel,
        architectures: [architecture, Architecture.ALL],
        frameworks,
        published: true,
        packageTypes: [PackageType.CLICK],
      });
    }),
  );

  discover.categories = categories.map((category, index) => {
    const apps = discoverCategoriesApps[index].map((app) => app.serialize(architecture, channel, frameworks, apiVersion));

    return {
      ...category,
      ids: shuffle(category.ids),
      apps: shuffle(apps),
    };
  });
}

/**
 * Set the popular apps in the discover data.
 */
async function getPopularApps(
  discover: DiscoverData,
  channel: Channel,
  architecture: Architecture,
  frameworks: string[],
  apiVersion?: number,
) {
  const popularApps = await Package.findByFilters(
    {
      published: true,
      channel,
      architectures: [architecture, Architecture.ALL],
      frameworks,
      nsfw: [null, false],
      types: [AppType.APP],
      packageTypes: [PackageType.CLICK],
    },
    '-calculated_rating',
    8,
  );

  const popularCategory = discover.categories.find((category) => category.name === POPULAR);
  popularCategory!.apps = popularApps.map((app) => app.serialize(architecture, channel, frameworks, apiVersion));
}

/**
 * Refresh the ratings in the cached discover data
 */
async function refreshRatings(discover: DiscoverData) {
  const ids = discover.categories
    .reduce<string[]>((accumulator, category) => {
      return [...accumulator, ...category.ids];
    }, [])
    .concat(discover.highlights.map((highlight) => highlight.id));

  const ratingCounts = await RatingCount.getCountsByIds(ids);

  discover.highlights = discover.highlights.map((app) => {
    return {
      ...app,
      ratings: serializeRatings(ratingCounts[app.id]),
    };
  });
  discover.highlight = discover.highlights[0];

  discover.categories = discover.categories.map((category) => {
    return {
      ...category,
      apps: category.apps.map((app) => {
        return {
          ...app,
          ratings: serializeRatings(ratingCounts[app.id]),
        };
      }),
    };
  });
}

function translateDiscover(lang: string, discover: DiscoverData) {
  setLang(lang);

  return {
    ...discover,
    categories: discover.categories.map((category) => ({
      ...category,
      name: gettext(category.name),
      tagline: category.tagline ? gettext(category.tagline) : '',
    })),
  };
}

/**
 * Get highlighted apps based on the data stored in the database
 * This consists of a list of highlighted apps that have a banner image
 * and a list of categories that have several apps inside of them.
 * There are two static categories: one for new and updated apps
 * and one for popular apps.
 */
router.get(
  '/',
  asyncErrorWrapper(async (req: Request, res: Response) => {
    const frameworks = getDataArray(req, 'frameworks', []);
    const lang = getData(req, 'lang');

    const channel = handleChannel(getData(req, 'channel'));
    let architecture = getData(req, 'architecture', Architecture.ARMHF).toLowerCase() as Architecture;
    if (!Object.values(Architecture).includes(architecture)) {
      architecture = Architecture.ARMHF;
    }

    // Use hash for frameworks to avoid filename length issues with long framework lists
    const frameworksHash = frameworks.length > 0 ? crypto.createHash('md5').update(JSON.stringify(frameworks)).digest('hex') : 'none';
    const cacheKey = `${channel}-${architecture}-${frameworksHash}`;

    const now = Date.now();
    const cachedData = await getCachedData(cacheKey);

    if (!cachedData || now - cachedData.timestamp > CACHE_DURATION_MS) {
      // Cache miss (10 minutes)
      const discoverData = await Discover.getDiscoverData();
      if (!discoverData) {
        throw new Error('No discover data found in database');
      }

      const discover: DiscoverData = {
        highlights: discoverData.highlights as DiscoverHighlight[],
        categories: discoverData.categories as DiscoverCategory[],
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        highlight: {} as DiscoverHighlight, // Will be set by getHighlights
      };

      await Promise.all([
        getHighlights(discover, channel, architecture, frameworks, req.apiVersion),
        getCategoryApps(discover, channel, architecture, frameworks, req.apiVersion),
      ]);
      await Promise.all([
        getNewAndUpdatedApps(discover, channel, architecture, frameworks, req.apiVersion),
        getPopularApps(discover, channel, architecture, frameworks, req.apiVersion),
      ]);

      discover.categories = discover.categories.filter((category) => category.apps.length > 0);
      discover.categories = discover.categories.map((category) => {
        return {
          ...category,
          ids: category.apps.map((app) => app.id),
        };
      });

      await setCachedData(cacheKey, discover, frameworks);

      success(res, translateDiscover(lang, discover));
    } else {
      // Cache hit
      const discover: DiscoverData = structuredClone(cachedData.data);
      await refreshRatings(discover);

      success(res, translateDiscover(lang, discover));
    }
  }, 'Unable to fetch discovery data at this time'),
);

export default router;
