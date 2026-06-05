import { type Request } from 'express';
import { Schema, model } from 'mongoose';
/* eslint-disable no-await-in-loop */
import { sleep } from 'sleepjs';

import { logger, captureException } from '../../utils';
import { type HydratedLock, type ILock, type LockModel } from './types';

const TIMEOUT = 30 * 1000; // 30s in ms
const WAIT_TIME = 500; // ms
const MAX_RETRIES = 100;

const lockSchema = new Schema<ILock, LockModel>(
  {
    name: { type: String },
    expire: { type: Date },
    inserted: { type: Date, default: () => new Date() },
  },
  { autoIndex: true },
);

lockSchema.index({ name: 1 }, { unique: true });

lockSchema.statics.acquire = async function (name: string) {
  let lock: HydratedLock | null = null;
  let retries = MAX_RETRIES;

  while (retries > 0) {
    const now = Date.now();

    // Remove expired locks
    await this.findOneAndDelete({ name, expire: { $lt: new Date(now) } });

    const newLock = new this({
      name,
      expire: now + TIMEOUT,
      inserted: now,
    });

    try {
      await newLock.save();
      lock = newLock;
      logger.debug('Lock acquired');
      break;
    } catch (err) {
      if (err?.code === 11000) {
        // a lock already exists, try again
        logger.debug(`Lock exists, going to wait (retries: ${retries})`);
        retries--;
        if (retries > 0) {
          await sleep(WAIT_TIME);
        }
      } else {
        throw err;
      }
    }
  }

  if (!lock) {
    throw new Error(`Failed to acquire lock "${name}" after ${MAX_RETRIES} attempts`);
  }

  return lock;
};

lockSchema.statics.release = async function (lock: HydratedLock | null, req: Request) {
  if (!lock) {
    return;
  }

  try {
    await lock.deleteOne();
  } catch (err) {
    logger.error('failed to release lock');
    captureException(err, req.originalUrl);
  }
};

export const Lock = model<ILock, LockModel>('Lock', lockSchema);
