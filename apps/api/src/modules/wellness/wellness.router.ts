import { Router } from 'express';
import { authGuard, requireRole } from '../../middleware/auth.js';
import { submitWellness, getMyWellness, getTeamWellness, checkWellnessStatus } from './wellness.controller.js';

const router = Router();
router.use(authGuard);

router.get('/status',       checkWellnessStatus);
router.get('/mine',         getMyWellness);
router.post('/respond',     submitWellness);
router.get('/team',         requireRole('ADMIN', 'RH', 'MANAGER'), getTeamWellness);

export default router;
