import express from 'express';
import namespaces from './namespaces';

const router = express.Router();

router.use('/namespaces', namespaces);

export default router;
