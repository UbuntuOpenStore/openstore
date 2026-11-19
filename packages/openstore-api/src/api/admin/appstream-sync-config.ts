// SPDX-License-Identifier: AGPL-3.0-or-later
import express, { type Request, type Response } from 'express';
import { z } from 'zod/v4';

import { AppstreamSyncConfig } from '../../db/appstream_sync_config';
import { ValidationError } from '../../exceptions';
import { adminOnly, authenticate } from '../../middleware';
import { asyncErrorWrapper, error, success } from '../../utils';

const sourceSchema = z.object({
  url: z.string().min(1),
  icon_url: z.string().min(1),
  architecture: z.string().min(1),
});

const editableConfigSchema = z.object({
  sources: z.array(sourceSchema),
  allowlist: z.array(z.string()),
});

const router = express.Router();

async function getConfig(_req: Request, res: Response) {
  const { config } = await AppstreamSyncConfig.getOrCreate();
  success(res, config);
}

function validateAllowlist(allowlist: string[]) {
  for (const pattern of allowlist) {
    try {
      new RegExp(pattern);
    } catch (err) {
      throw new ValidationError(`Invalid allowlist pattern "${pattern}": ${(err as Error).message}`);
    }
  }
}

async function updateConfig(req: Request, res: Response) {
  const validation = editableConfigSchema.safeParse(req.body);
  if (!validation.success) {
    const messages = validation.error.issues.map((issue) =>
      issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    );
    error(res, messages.join(', '), 400);
    return;
  }

  const { sources, allowlist } = validation.data;
  validateAllowlist(allowlist);

  const config = await AppstreamSyncConfig.updateEditable({ sources, allowlist });
  success(res, config);
}

router.get('/', authenticate, adminOnly, asyncErrorWrapper(getConfig, 'Unable to fetch the AppStream configuration'));
router.put('/', authenticate, adminOnly, asyncErrorWrapper(updateConfig, 'Unable to update the AppStream configuration'));

export default router;
