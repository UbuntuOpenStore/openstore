import fs from 'fs';
import fsPromise from 'fs/promises';

import express, { type Request, type Response } from 'express';

import { Package } from '../db/package';
import { Architecture, type HydratedPackage, PackageType } from '../db/package/types';
import { NotFoundError, UserError } from '../exceptions';
import { fetchPublishedPackage } from '../middleware';
import {
  success,
  getData,
  apiLinks,
  asyncErrorWrapper,
  getDataArray,
  getDataBoolean,
  logger,
  captureException,
  config,
  error,
} from '../utils';
import { handleChannel } from '../utils/channels';
import { DOWNLOAD_NOT_FOUND_FOR_CHANNEL, INVALID_ARCH, SNAP_DOWNLOAD_NOT_SUPPORTED } from '../utils/error-messages';
import reviews from './reviews';

const router = express.Router();

/**
 * Fetch a list of apps based on the given filters. If the `full` parameter is passed
 * then the full serialized object will be returned, otherwise the 'slim' version will be used.
 */
async function apps(req: Request, res: Response) {
  const filters = Package.parseRequestFilters(req);
  // Apps API always filters for published apps only, ignore any published parameter from the request
  filters.published = true;

  let count = 0;
  let pkgs: HydratedPackage[] = [];

  // Send search queries to elastic search
  // Author/publisher queries have been moved to a separate parameter, this is just for backwards compatibility
  if (filters.search && !filters.search.startsWith('author:') && !filters.search.startsWith('publisher:')) {
    const results = await Package.searchByFilters(filters, getDataBoolean(req, 'full', false));
    pkgs = results.pkgs;
    count = results.count;
  } else {
    pkgs = await Package.findByFilters(filters, filters.sort, filters.limit, filters.skip);
    count = await Package.countByFilters(filters);
  }

  const arch = getData(req, 'architecture', Architecture.ARMHF) as Architecture;
  const channel = handleChannel(getData(req, 'channel'));
  const frameworks = getDataArray(req, 'frameworks', []);
  const formatted = pkgs.map((pkg) => {
    if (req.query.full) {
      return pkg.serialize(arch, channel, frameworks, req.apiVersion);
    }

    return pkg.serializeSlim();
  });

  const { next, previous } = apiLinks(req.originalUrl, formatted.length, filters.limit, filters.skip);
  success(res, { count, next, previous, packages: formatted });
}

// Available also as a POST to avoid issues with the GET request params being to large
router.get('/', asyncErrorWrapper(apps, 'Could not fetch app list at this time'));
router.post('/', asyncErrorWrapper(apps, 'Could not fetch app list at this time'));

/**
 * Get one app and return a serialized version.
 */
router.get('/:id', fetchPublishedPackage(true), async (req: Request, res: Response) => {
  // Allow access if either:
  // 1. Package type is in the allowed list, OR
  // 2. Request explicitly specifies package_type that matches the app's package_type
  const requestedPackageTypes = [...getDataArray(req, 'package_types'), ...getDataArray(req, 'package_type')];
  if (!config.allowed_package_types.includes(req.pkg.package_type) && !requestedPackageTypes.includes(req.pkg.package_type)) {
    error(res, 'Package type not available', 404);
    return;
  }

  const arch = getData(req, 'architecture', Architecture.ARMHF) as Architecture;
  const channel = handleChannel(getData(req, 'channel'));
  const frameworks = getDataArray(req, 'frameworks', []);
  success(res, req.pkg.serialize(arch, channel, frameworks, req.apiVersion));
});

/**
 * Gets the download for a given package for the given channel and architecture.
 */
async function download(req: Request, res: Response) {
  // Prevent downloads for snap packages
  if (req.pkg.package_type === PackageType.SNAP) {
    throw new UserError(SNAP_DOWNLOAD_NOT_SUPPORTED);
  }

  const channel = handleChannel(req.params.channel);

  const arch = req.params.arch ? (req.params.arch.toLowerCase() as Architecture) : Architecture.ARMHF;
  if (!Object.values(Architecture).includes(arch)) {
    throw new UserError(INVALID_ARCH);
  }

  const version = req.params.version && req.params.version !== 'latest' ? req.params.version : undefined;
  const { revisionData, revisionIndex } = req.pkg.getLatestRevision(channel, arch, true, undefined, version);

  if (!revisionData || !revisionData.download_url) {
    throw new NotFoundError(DOWNLOAD_NOT_FOUND_FOR_CHANNEL);
  }

  const stat = await fsPromise.stat(revisionData.download_url);
  res.setHeader('Content-Length', stat.size);
  // TODO if we ever offer anything other than a click file this should change
  res.setHeader('Content-type', 'application/vnd.debian.binary-package');
  res.setHeader('Content-Disposition', `attachment; filename=${req.pkg.id as string}_${revisionData.version}_${arch}.click`);

  // TODO let nginx handle this, making this just a 302
  const fileStream = fs.createReadStream(revisionData.download_url);

  fileStream.on('error', (err) => {
    logger.error('Error streaming file:', err);
    captureException(err, req.originalUrl);
    if (!res.headersSent) {
      res.status(500).end();
    }
  });

  req.on('close', () => {
    fileStream.destroy();
  });

  fileStream.pipe(res);

  await Package.incrementDownload(req.pkg._id, revisionIndex);
}

// The route gets the latest version
router.get('/:id/download/:channel/:arch', fetchPublishedPackage(), asyncErrorWrapper(download, 'Could not download package at this time'));
// This route is for getting historical versions
router.get(
  '/:id/download/:channel/:arch/:version',
  fetchPublishedPackage(),
  asyncErrorWrapper(download, 'Could not download package at this time'),
);

router.use('/:id/reviews', reviews);

export default router;
