import express from 'express';

import discover from './discover';
import namespaces from './namespaces';

const router = express.Router();

router.use('/namespaces', namespaces);
router.use('/discover', discover);

export default router;
