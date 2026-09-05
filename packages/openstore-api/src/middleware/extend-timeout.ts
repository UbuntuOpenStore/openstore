// SPDX-License-Identifier: AGPL-3.0-or-later
import { type Request, type Response, type NextFunction } from 'express';

export function extendTimeout(req: Request, res: Response, next: NextFunction) {
  // There seems to be a default timeout of 2 minutes: https://stackoverflow.com/a/46157120
  const timeout = 240000; // 4 minutes
  req.socket.setTimeout(timeout);

  const timeoutHandler = () => {
    console.log('socket timeout processing', req.originalUrl, req.params);
  };

  // Use once instead of on to auto-cleanup
  req.socket.once('timeout', timeoutHandler);

  const cleanup = () => {
    req.socket.removeListener('timeout', timeoutHandler);
  };

  res.on('finish', cleanup);
  res.on('close', cleanup);

  next();
}
