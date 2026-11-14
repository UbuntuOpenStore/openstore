// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from 'crypto';

import express, { type Request, type Response } from 'express';

import { Discover } from '../db/discover';
import { Architecture, PackageType, type HydratedPackage, type SerializedDiscoverApp, type SerializedPackage } from '../db/package/types';
import { success, getData, getDataArray, asyncErrorWrapper, config, filterAllowedPackageTypes } from '../utils';
import { handleChannel } from '../utils/channels';
import {
  CACHE_DURATION_MS,
  getCachedData,
  setCachedData,
  getHighlights,
  getCategoryApps,
  getNewAndUpdatedApps,
  getPopularApps,
  refreshRatings,
  translateDiscover,
} from './discover-helpers';
import { type DiscoverData, type DiscoverDataV5, type DiscoverHighlight } from './types';

const router = express.Router();

/**
 * Get highlighted apps based on the data stored in the database
 * This consists of a list of highlighted apps that have a banner image
 * and a list of categories that have several apps inside of them.
 * There are three static categories: one for new apps, one for updated
 * apps and one for popular apps.
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

    const packageTypes = config.allowed_package_types.has(PackageType.CLICK) ? [PackageType.CLICK] : [];
    const cacheHash = crypto.createHash('md5').update(JSON.stringify({ packageTypes, frameworks })).digest('hex');
    const cacheKey = `v4-${channel}-${architecture}-${cacheHash}`;

    const serializeApp = (app: HydratedPackage): Omit<SerializedPackage, 'revisions'> => {
      const serialized = app.serialize(architecture, channel, frameworks, req.apiVersion);
      delete (serialized as Partial<SerializedPackage>).revisions;
      return serialized as Omit<SerializedPackage, 'revisions'>;
    };
    const serializeHighlight = (app: HydratedPackage) => ({
      image: app.banner_url,
      app: serializeApp(app),
    });

    const now = Date.now();
    const cachedData = await getCachedData<DiscoverData>(cacheKey);

    if (!cachedData || now - cachedData.timestamp > CACHE_DURATION_MS) {
      // Cache miss (10 minutes)
      const discoverData = await Discover.getDiscoverData();
      if (!discoverData) {
        throw new Error('No discover data found in database');
      }

      const discover: DiscoverData = {
        highlights: [],
        categories: [],
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        highlight: {} as DiscoverHighlight, // Will be set below
      };

      [discover.highlights, discover.categories] = await Promise.all([
        getHighlights(discoverData.highlights, channel, architecture, frameworks, packageTypes, serializeHighlight),
        getCategoryApps(discoverData.categories, channel, architecture, frameworks, packageTypes, serializeApp),
      ]);
      await Promise.all([
        getNewAndUpdatedApps(discover.categories, channel, architecture, frameworks, packageTypes, serializeApp),
        getPopularApps(discover.categories, channel, architecture, frameworks, packageTypes, serializeApp),
      ]);

      discover.categories = discover.categories.filter((category) => category.apps.length > 0);
      for (const category of discover.categories) {
        category.ids = category.apps.map((app) => app.id);
      }
      discover.highlight = discover.highlights[0];

      await setCachedData(cacheKey, discover, frameworks);

      success(res, translateDiscover(lang, discover));
    } else {
      // Cache hit
      const discover = cachedData.data;
      await refreshRatings(discover);
      discover.highlight = discover.highlights[0];

      success(res, translateDiscover(lang, discover));
    }
  }, 'Unable to fetch discovery data at this time'),
);

export default router;

const v5Router = express.Router();

v5Router.get(
  '/',
  asyncErrorWrapper(async (req: Request, res: Response) => {
    const frameworks = getDataArray(req, 'frameworks', []);
    const lang = getData(req, 'lang');

    const channel = handleChannel(getData(req, 'channel'));
    let architecture = getData(req, 'architecture', Architecture.ARMHF).toLowerCase() as Architecture;
    if (!Object.values(Architecture).includes(architecture)) {
      architecture = Architecture.ARMHF;
    }

    const packageTypeParams = [...getDataArray(req, 'package_types'), ...getDataArray(req, 'package_type')];
    const packageTypes = filterAllowedPackageTypes(
      packageTypeParams.length > 0 ? (packageTypeParams as PackageType[]) : [...config.default_package_types],
    );

    const cacheHash = crypto.createHash('md5').update(JSON.stringify({ packageTypes, frameworks })).digest('hex');
    const cacheKey = `v5-${channel}-${architecture}-${cacheHash}`;

    const serializeApp = (app: HydratedPackage): SerializedDiscoverApp => app.serializeDiscoverSlim();
    const serializeHighlight = (app: HydratedPackage) => ({
      image: app.banner_url,
      app: app.serializeDiscoverSlim(),
      publisher: app.author || '',
    });

    const now = Date.now();
    const cachedData = await getCachedData<DiscoverDataV5>(cacheKey);

    if (!cachedData || now - cachedData.timestamp > CACHE_DURATION_MS) {
      // Cache miss (10 minutes)
      const discoverData = await Discover.getDiscoverData();
      if (!discoverData) {
        throw new Error('No discover data found in database');
      }

      const discover: DiscoverDataV5 = {
        highlights: [],
        categories: [],
      };

      let categories: Array<{ name: string; tagline: string; referral: string; ids: string[]; apps: SerializedDiscoverApp[] }> = [];

      [discover.highlights, categories] = await Promise.all([
        getHighlights(discoverData.highlights, channel, architecture, frameworks, packageTypes, serializeHighlight),
        getCategoryApps(discoverData.categories, channel, architecture, frameworks, packageTypes, serializeApp, true),
      ]);
      await Promise.all([
        getNewAndUpdatedApps(categories, channel, architecture, frameworks, packageTypes, serializeApp),
        getPopularApps(categories, channel, architecture, frameworks, packageTypes, serializeApp),
      ]);

      discover.categories = categories.filter((category) => category.apps.length > 0).map(({ ids: _ids, ...category }) => category);

      await setCachedData(cacheKey, discover, frameworks);

      success(res, translateDiscover(lang, discover));
    } else {
      // Cache hit: ratings are served stale in v5 (no refreshRatings)
      success(res, translateDiscover(lang, cachedData.data));
    }
  }, 'Unable to fetch discovery data at this time'),
);

export const discoverV5 = v5Router;
