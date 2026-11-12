// SPDX-License-Identifier: GPL-3.0-or-later OR AGPL-3.0-or-later
import { existsSync } from 'fs';
import fs from 'fs/promises';

import express, { type Request, type Response } from 'express';
import { Types } from 'mongoose';
import multer from 'multer';

import { type HydratedLock, Lock } from '../db/lock';
import { DEFAULT_CHANNEL, DEPRECATED_CHANNELS, Package, PackageType, packageKitDefaults } from '../db/package';
import { packageSearchInstance } from '../db/package/search-factory';
import { ReservedNamespace } from '../db/reserved_namespace';
import { HttpError, UserError, AuthorizationError, NotFoundError, ClickReviewError } from '../exceptions';
import {
  authenticate,
  userRole,
  downloadFile,
  extendTimeout,
  fetchPackage,
  canManage,
  canManageLocked,
  maintenanceMode,
} from '../middleware';
import { success, error, captureException, moveFile, apiLinks, logger, asyncErrorWrapper, config } from '../utils';
import { handleChannel } from '../utils/channels';
import {
  APP_NOT_FOUND,
  PERMISSION_DENIED,
  BAD_FILE,
  NO_FILE,
  NO_REVISIONS,
  APP_HAS_REVISIONS,
  APP_LOCKED,
  ADMIN_MESSAGE_NOT_ACKNOWLEDGED,
  NEEDS_MANUAL_REVIEW,
  CLICK_REVIEW_ERROR,
  INVALID_CHANNEL,
  NO_LICENSE_SPECIFIED,
  INVALID_APP_ID_PREFIX,
  PACKAGE_TYPE_NOT_ALLOWED,
} from '../utils/error-messages';
import { clickReview } from '../utils/review-package';
import { validateNamespace } from '../utils/validate-namespace';
import { createAdminAppSchema, createAppSchema } from './manage.schema';

const mupload = multer({ dest: '/tmp' });
const router = express.Router();

/**
 * Get a list of apps belonging to the logged in user.
 * If the user is an admin, return all apps of every package type.
 */
router.get(
  '/',
  authenticate,
  userRole,
  asyncErrorWrapper(async (req: Request, res: Response) => {
    const filters = Package.parseRequestFilters(req);
    if (!req.isAdminUser) {
      filters.publisherId = req.user!._id.toString();
    }

    const pkgs = await Package.findByFilters(filters, filters.sort, filters.limit, filters.skip, false);
    const count = await Package.countByFilters(filters, false);

    const formatted = pkgs.map((pkg) => pkg.serialize(undefined, undefined, undefined, undefined, true, true));
    const { next, previous } = apiLinks(req.originalUrl, formatted.length, filters.limit, filters.skip);
    success(res, { count, next, previous, packages: formatted });
  }, 'Could not fetch app list at this time'),
);

/**
 * Get one app belonging to the logged in user.
 */
router.get('/:id', authenticate, userRole, fetchPackage(), canManage, async (req: Request, res: Response) => {
  success(res, req.pkg.serialize(undefined, undefined, undefined, undefined, true, true));
});

/**
 * Create a new app from the provided name and id.
 */
router.post(
  '/',
  maintenanceMode,
  authenticate,
  userRole,
  downloadFile,
  asyncErrorWrapper(async (req: Request, res: Response) => {
    const body = { ...req.body };
    if (!req.isAdminUser) {
      delete body.package_type;
    }

    const schema = req.isAdminUser ? createAdminAppSchema : createAppSchema;
    const validation = schema.safeParse(body);
    if (!validation.success) {
      error(res, validation.error.issues[0].message, 400);
      return;
    }

    const { id: requestedId, name, license, source } = validation.data;
    const packageType = validation.data.package_type ?? PackageType.CLICK;

    if (!config.allowed_package_types.has(packageType)) {
      error(res, PACKAGE_TYPE_NOT_ALLOWED, 400);
      return;
    }

    // Click ids must be lowercase. Other package types are case sensitive and
    // keep the case provided by the caller.
    const id = packageType === PackageType.CLICK ? requestedId.toLowerCase() : requestedId;

    await validateNamespace(id, req.user!._id.toString(), !!req.isAdminUser);

    await Package.checkId(id);
    if (!req.isAdminUser && !req.isTrustedUser) {
      Package.checkRestrictedId(id);
    }

    let pkg = new Package();
    pkg.id = id;
    pkg.name = name;
    pkg.maintainer = req.user!._id.toString();
    pkg.maintainer_name = req.user!.name ? req.user!.name : req.user!.username;
    pkg.package_type = packageType;
    pkg.license = license;
    pkg.source = source;

    if (packageType === PackageType.PACKAGEKIT) {
      Object.assign(pkg, packageKitDefaults());
    }

    if (
      (packageType === PackageType.PACKAGEKIT && !id.startsWith('packagekit.')) ||
      (packageType === PackageType.SNAP && !id.startsWith('snap.'))
    ) {
      error(res, INVALID_APP_ID_PREFIX, 400);
      return;
    }

    pkg = await pkg.save();

    success(res, pkg.serialize(undefined, undefined, undefined, undefined, true, true));
  }, 'There was an error creating your app, please try again later'),
);

const putUpload = mupload.fields([
  /*
    Don't have a max count here because items over the max count cause a cryptic error,
    the handling of extra files is done in updateScreenshotFiles()
  */
  { name: 'screenshot_files' },
  { name: 'banner_file', maxCount: 1 },
]);

/**
 * Update an app. This includes stuff like the description, changelog, screenshots, etc.
 * This does not include updating the revisions.
 */
router.put(
  '/:id',
  maintenanceMode,
  authenticate,
  putUpload,
  userRole,
  fetchPackage(),
  canManageLocked,
  asyncErrorWrapper(async (req: Request, res: Response) => {
    if (req.body && (!req.body.maintainer || req.body.maintainer === 'null')) {
      req.body.maintainer = req.user!._id;
    }

    // Ensure non-admins cannot update admin only fields
    if (!req.isAdminUser && req.body) {
      delete req.body.maintainer;
      delete req.body.locked;
      delete req.body.type_override;
      delete req.body.desktop_names_override;
      delete req.body.admin_message;

      // Maintainers may only acknowledge an existing message while the app is not locked.
      // They cannot un-acknowledge it.
      if (req.body.admin_message_acknowledged !== undefined) {
        const acknowledged =
          req.body.admin_message_acknowledged === 'true' ||
          req.body.admin_message_acknowledged === 'on' ||
          req.body.admin_message_acknowledged === true;

        if (!acknowledged || !req.pkg.admin_message || req.pkg.locked) {
          delete req.body.admin_message_acknowledged;
        }
      }
    }

    const existingLicense = req.pkg.license?.trim() ?? '';
    const license = typeof req.body.license === 'string' ? req.body.license.trim() : '';
    if (!existingLicense && !license) {
      error(res, NO_LICENSE_SPECIFIED, 400);
      return;
    }

    const published = req.body.published === 'true' || req.body.published === true || req.body.published === 'on';
    if (published && req.pkg.revisions.length === 0 && req.pkg.package_type !== PackageType.PACKAGEKIT) {
      error(res, NO_REVISIONS, 400);
      return;
    }

    await req.pkg.updateFromBody(req.body);

    if (req.files && !Array.isArray(req.files)) {
      if (req.files.screenshot_files && req.files.screenshot_files.length > 0) {
        await req.pkg.updateScreenshotFiles(req.files.screenshot_files);
      }

      if (req.files.banner_file && req.files.banner_file.length > 0) {
        await req.pkg.updateBannerFile(req.files.banner_file[0]);
      }
    }

    const pkg = await req.pkg.save();

    if (pkg.published) {
      await packageSearchInstance.upsert(pkg);
    } else {
      await packageSearchInstance.remove(pkg);
    }

    success(res, pkg.serialize(undefined, undefined, undefined, undefined, true, true));
  }, 'There was an error updating your app, please try again later'),
);

/**
 * Delete an app. This can only be done before the app has revisions attached.
 */
router.delete(
  '/:id',
  maintenanceMode,
  authenticate,
  userRole,
  fetchPackage(),
  canManageLocked,
  asyncErrorWrapper(async (req: Request, res: Response) => {
    // Allow deletion of apps with revisions if force=true is specified
    const forceDelete = req.query.force === 'true';

    if (req.pkg.revisions.length > 0 && !forceDelete) {
      error(res, APP_HAS_REVISIONS, 400);
      return;
    }

    if (req.pkg.revisions.length > 0) {
      for (const revision of req.pkg.revisions) {
        try {
          if (revision.download_url) {
            const filePath = revision.download_url;
            if (existsSync(filePath)) {
              await fs.unlink(filePath);
              logger.info(`Deleted click file: ${filePath}`);
            }
          }
        } catch (err) {
          logger.error('Error deleting revision file:', err);
          captureException(err, req.originalUrl);
        }
      }
    }

    try {
      if (req.pkg.icon) {
        const iconPath = req.pkg.icon;
        if (existsSync(iconPath)) {
          await fs.unlink(iconPath);
          logger.info(`Deleted icon file: ${iconPath}`);
        }
      }
    } catch (err) {
      logger.error('Error deleting icon file:', err);
      captureException(err, req.originalUrl);
    }

    try {
      await packageSearchInstance.remove(req.pkg);
    } catch (err) {
      logger.error('Error removing from search index:', err);
      captureException(err, req.originalUrl);
    }

    // Create a namespace reservation for the deleted app's ID
    try {
      const existingNamespace = await ReservedNamespace.findByNamespace(req.pkg.id);
      if (!existingNamespace && req.pkg.maintainer) {
        const reservedNamespace = new ReservedNamespace({
          namespace: req.pkg.id,
          type: 'exact',
          owner_id: new Types.ObjectId(req.pkg.maintainer),
        });

        await reservedNamespace.save();
      }
    } catch (err) {
      logger.error('Error creating namespace reservation:', err);
      captureException(err, req.originalUrl);
    }

    await req.pkg.deleteOne();
    success(res, {});
  }, 'There was an error deleting your app, please try again later'),
);

const postUpload = mupload.fields([{ name: 'file', maxCount: 1 }]);

/**
 * Create a new revision for an app via the uploaded file. A revision is specific to a channel and an
 * architecture.
 */
router.post(
  '/:id/revision',
  maintenanceMode,
  authenticate,
  extendTimeout,
  postUpload,
  userRole,
  downloadFile,
  async (req: Request, res: Response) => {
    if (!req.files || Array.isArray(req.files) || !req.files.file || req.files.file.length === 0) {
      error(res, NO_FILE, 400);
      return;
    }

    const file = req.files.file[0];

    let channel = DEFAULT_CHANNEL;
    try {
      channel = handleChannel(req.body.channel);
    } catch (err) {
      if (err instanceof UserError) {
        error(res, INVALID_CHANNEL, 400);
        return;
      }

      throw err;
    }

    if (DEPRECATED_CHANNELS.includes(channel)) {
      error(res, INVALID_CHANNEL, 400);
      return;
    }

    let lock: HydratedLock | null = null;
    const filePath = `${file.path}.click`;
    try {
      lock = await Lock.acquire(`revision-${req.params.id}`);
      await moveFile(file.path, filePath);

      // Not using the fetchPackage middleware because we need to lock before fetching the package
      let pkg = await Package.findOneByFilters(req.params.id);
      if (!pkg) {
        throw new NotFoundError(APP_NOT_FOUND);
      }

      if (!req.isAdminUser && req.user!._id.toString() !== pkg.maintainer) {
        throw new AuthorizationError(PERMISSION_DENIED);
      }

      if (!req.isAdminUser && pkg.locked) {
        throw new AuthorizationError(APP_LOCKED);
      }

      if (!req.isAdminUser && pkg.admin_message && !pkg.admin_message_acknowledged) {
        throw new UserError(ADMIN_MESSAGE_NOT_ACKNOWLEDGED);
      }

      if (!config.allowed_package_types.has(pkg.package_type)) {
        throw new UserError(PACKAGE_TYPE_NOT_ALLOWED);
      }

      if (!file.originalname.endsWith('.click')) {
        throw new UserError(BAD_FILE);
      }

      if (req.isAdminUser && pkg.skip_review) {
        logger.info(`Skipping review for ${pkg.id as string}`);
      } else {
        const reviewSummary = await clickReview(filePath, pkg.review_exceptions ?? []);
        if (!req.isAdminUser && !req.isTrustedUser) {
          // Admin & trusted users can upload apps without manual review

          if (reviewSummary.manualReviewMessages.length > 0) {
            throw new ClickReviewError(NEEDS_MANUAL_REVIEW, reviewSummary.manualReviewMessages);
          }
        }

        // Everyone needs to upload apps without issues
        if (reviewSummary.errorMessages.length > 0 || reviewSummary.warningMessages.length > 0) {
          throw new ClickReviewError(CLICK_REVIEW_ERROR, reviewSummary.errorMessages.concat(reviewSummary.warningMessages));
        }
      }

      await pkg.createRevisionFromClick(filePath, channel, req.body.changelog);
      pkg.updateCalculatedProperties();

      pkg = await pkg.save();

      if (pkg.published) {
        await packageSearchInstance.upsert(pkg);
      }

      await Lock.release(lock, req);
      success(res, pkg.serialize(undefined, undefined, undefined, undefined, true, true));
    } catch (err) {
      if (lock) {
        await Lock.release(lock, req);
      }

      // Clean up the uploaded file
      if (existsSync(file.path)) {
        try {
          await fs.unlink(file.path);
        } catch (fileError) {
          logger.error(`Error deleting file: ${file.path}`);
          captureException(fileError, req.originalUrl);
        }
      }

      // Clean up the file in the final destination
      if (existsSync(filePath)) {
        try {
          await fs.unlink(filePath);
        } catch (fileError) {
          logger.error(`Error deleting file: ${filePath}`);
          captureException(fileError, req.originalUrl);
        }
      }

      if (err instanceof ClickReviewError) {
        error(res, err.message, err.httpCode, {
          reasons: err.reasons,
        });
        return;
      }
      if (err instanceof HttpError) {
        error(res, err.message, err.httpCode);
        return;
      }

      const message = err?.message ? err.message : err;
      logger.error(`Error updating package: ${message as string}`);
      captureException(err, req.originalUrl);

      error(res, 'There was an error updating your app, please try again later');
    }
  },
);

export default router;
