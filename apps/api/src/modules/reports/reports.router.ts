import { Router } from 'express';
import { authGuard, requireRole } from '../../middleware/auth.js';
import { generateReport } from './reports.controller.js';

const router = Router();
router.use(authGuard);

router.post('/generate', requireRole('ADMIN', 'RH', 'MANAGER'), generateReport);

export default router;
