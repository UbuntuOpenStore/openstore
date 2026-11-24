// SPDX-License-Identifier: AGPL-3.0-or-later
import express from 'express';

import appstreamSyncConfig from './appstream-sync-config';
import discover from './discover';
import namespaces from './namespaces';

const router = express.Router();

router.use('/namespaces', namespaces);
router.use('/discover', discover);
router.use('/appstream-sync-config', appstreamSyncConfig);

export default router;
