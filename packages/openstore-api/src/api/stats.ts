import express, { type Request, type Response } from 'express';

import { Package } from '../db/package';
import { success } from '../utils';

const router = express.Router();

/**
 * Return various stats about apps in the store
 */
router.get('/', async (req: Request, res: Response) => {
  success(res, await Package.stats());
});

export default router;
