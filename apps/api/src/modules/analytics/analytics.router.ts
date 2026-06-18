import { Router } from 'express';
import { authGuard, requireRole } from '../../middleware/auth.js';
import { getOverview } from './analytics.controller.js';

const router = Router();

router.use(authGuard, requireRole('ADMIN', 'RH', 'MANAGER'));
router.get('/overview', getOverview);

export default router;
