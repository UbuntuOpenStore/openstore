import fs from 'fs';
import path from 'path';

import axios from 'axios';
import { type Request, type Response, type NextFunction } from 'express';

import { error, config, captureException, logger } from '../utils';

export async function downloadFile(req: Request, res: Response, next: NextFunction) {
  if (!req.file && req.body && req.body.downloadUrl) {
    let filename = path.basename(req.body.downloadUrl);

    // Strip extra hashes & params
    if (filename.includes('?')) {
      filename = filename.substring(0, filename.indexOf('?'));
    }

    if (filename.includes('#')) {
      filename = filename.substring(0, filename.indexOf('#'));
    }

    try {
      const response = await axios.get(req.body.downloadUrl, { responseType: 'stream' });
      if (response.status === 200) {
        const tmpfile = `${config.data_dir}/${filename}`;
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

        writer.on('error', (err) => {
          cleanup();
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
                size: fs.statSync(tmpfile).size,
              } as any,
            ],
          };
          next();
        });

        // Handle request abort/timeout
        req.on('close', () => {
          cleanup();
          logger.debug('Request closed during file download');
        });

        req.on('aborted', () => {
          cleanup();
          logger.debug('Request aborted during file download');
        });

        // Handle stream errors from axios response
        response.data.on('error', (err: Error) => {
          cleanup();
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
      if (!res.headersSent) {
        error(res, 'Failed to download remote file', 400);
      }
    }
  } else {
    next();
  }
}
