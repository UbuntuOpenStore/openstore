// SPDX-License-Identifier: AGPL-3.0-or-later
import { type Request, type Response, type NextFunction } from 'express';

import { Package, type PackageRequestFilters } from '../db/package';
import { NotFoundError } from '../exceptions';
import { asyncErrorWrapper } from '../utils';
import { APP_NOT_FOUND } from '../utils/error-messages';

export function fetchPackage(published = false, useQuery = false) {
  return asyncErrorWrapper(async (req: Request, res: Response, next: NextFunction) => {
    let filters: PackageRequestFilters = {};
    if (useQuery) {
      const { frameworks, architectures, channel } = Package.parseRequestFilters(req);
      filters = { frameworks, architectures, channel };
    }

    if (published) {
      filters.published = true;
    }

    const pkg = await Package.findOneByFilters(req.params.id, filters);
    if (!pkg) {
      throw new NotFoundError(APP_NOT_FOUND);
    }

    req.pkg = pkg;
    next();
  }, 'Could not fetch app info at this time');
}

export function fetchPublishedPackage(useQuery = false) {
  return fetchPackage(true, useQuery);
}
