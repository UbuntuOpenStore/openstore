import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';

import axios from 'axios';
import { type Request, type Response, type NextFunction } from 'express';

import { error, config, captureException, logger } from '../utils';
import { INVALID_URL, INVALID_FILENAME } from '../utils/error-messages';

const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_CONTENT_LENGTH = 800 * 1024 * 1024; // 800 MB

export async function downloadFile(req: Request, res: Response, next: NextFunction) {
  if (!req.file && req.body && req.body.downloadUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(req.body.downloadUrl);
    } catch {
      error(res, INVALID_URL, 400);
      return;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      error(res, INVALID_URL, 400);
      return;
    }

    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(hostname) || hostname === 'localhost') {
      error(res, INVALID_URL, 400);
      return;
    }

    let filename = path.basename(parsedUrl.pathname);

    if (filename.includes('?')) {
      filename = filename.substring(0, filename.indexOf('?'));
    }

    if (filename.includes('#')) {
      filename = filename.substring(0, filename.indexOf('#'));
    }

    if (!filename.endsWith('.click')) {
      error(res, INVALID_FILENAME, 400);
      return;
    }

    let tmpfile: string | undefined;
    try {
      const response = await axios.get(req.body.downloadUrl, {
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxContentLength: MAX_CONTENT_LENGTH,
      });
      if (response.status === 200) {
        tmpfile = `${config.data_dir}/${crypto.randomUUID()}.click`;
        const writer = fs.createWriteStream(tmpfile);
        let cleaned = false;

        const cleanup = () => {
          if (!cleaned) {
            cleaned = true;
            writer.removeAllListeners();
            if (response.data.unpipe) {
              response.data.unpipe(writer);
            }
            writer.destroy();
          }
        };

        const cleanupAndRemove = () => {
          cleanup();
          if (tmpfile) {
            fs.unlink(tmpfile, () => {});
          }
        };

        writer.on('error', (err) => {
          cleanupAndRemove();
          captureException(err, req.originalUrl);
          error(res, 'Failed to download remote file', 400);
        });

        writer.on('finish', () => {
          cleanup();
          req.files = {
            file: [
              {
                originalname: filename,
                path: tmpfile,
                size: fs.statSync(tmpfile!).size,
              } as any,
            ],
          };
          next();
        });

        // Handle request abort/timeout
        req.on('close', () => {
          cleanupAndRemove();
          logger.debug('Request closed during file download');
        });

        req.on('aborted', () => {
          cleanupAndRemove();
          logger.debug('Request aborted during file download');
        });

        // Handle stream errors from axios response
        response.data.on('error', (err: Error) => {
          cleanupAndRemove();
          captureException(err, req.originalUrl);
          if (!res.headersSent) {
            error(res, 'Failed to download remote file', 400);
          }
        });

        response.data.pipe(writer);
      } else {
        error(res, 'Failed to download remote file', 400);
      }
    } catch (err) {
      captureException(err, req.originalUrl);
      if (tmpfile) {
        fs.unlink(tmpfile, () => {});
      }
      if (!res.headersSent) {
        error(res, 'Failed to download remote file', 400);
      }
    }
  } else {
    next();
  }
}
