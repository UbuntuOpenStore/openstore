import { type Request, type Response, type NextFunction } from 'express';
import { error } from '../utils';
import { APP_LOCKED, PERMISSION_DENIED, SNAP_MANAGEMENT_NOT_SUPPORTED } from '../utils/error-messages';
import { PackageType } from '../db/package/types';

export function canManage(req: Request, res: Response, next: NextFunction) {
  if (req.pkg.package_type === PackageType.SNAP) {
    error(res, SNAP_MANAGEMENT_NOT_SUPPORTED, 403);
    return;
  }

  if (!req.isAdminUser && req.user!._id.toString() !== req.pkg.maintainer) {
    error(res, PERMISSION_DENIED, 403);
    return;
  }

  next();
}

export function canManageLocked(req: Request, res: Response, next: NextFunction) {
  canManage(req, res, () => {
    if (!req.isAdminUser && req.pkg.locked) {
      error(res, APP_LOCKED, 403);
      return;
    }

    next();
  });
}
