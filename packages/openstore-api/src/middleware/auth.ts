// SPDX-License-Identifier: AGPL-3.0-or-later
import { type Request, type Response, type NextFunction } from 'express';
import passport from 'passport';

import { type HydratedUser } from '../db/user';
import { error } from '../utils';
import { ACCOUNT_DISABLED } from '../utils/error-messages';

export function userRole(req: Request, res: Response, next: NextFunction) {
  req.isAdminUser = req.isAuthenticated() && req.user.role === 'admin';
  req.isTrustedUser = req.isAuthenticated() && req.user.role === 'trusted';

  if (req.isAuthenticated() && req.user.role !== 'disabled') {
    next();
  } else {
    const reason = req.isAuthenticated() && req.user.disabled_reason;
    error(res, reason ? `${ACCOUNT_DISABLED}: ${reason}` : ACCOUNT_DISABLED, 403);
  }
}

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    next();
  } else {
    error(res, 'Forbidden', 403);
  }
}

// Check if the user is logged in, but allow anonymous access
export function anonymousAuthenticate(req: Request, res: Response, next: NextFunction) {
  passport.authenticate('localapikey', { session: false }, (err: Error | null, user: HydratedUser) => {
    if (err) {
      next(err);
      return;
    }

    req.user = user;
    next();
  })(req, res, next);
}

export const authenticate = passport.authenticate('localapikey', { session: false });
