import express from 'express';
import namespaces from './namespaces';
import discover from './discover';

const router = express.Router();

router.use('/namespaces', namespaces);
router.use('/discover', discover);

export default router;
