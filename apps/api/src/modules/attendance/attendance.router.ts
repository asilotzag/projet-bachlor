import { Router } from 'express';
import { authGuard, requireRole } from '../../middleware/auth.js';
import { getToday, batchUpsert, getHistory } from './attendance.controller.js';

const router = Router();
router.use(authGuard, requireRole('ADMIN', 'RH'));

router.get('/today',   getToday);
router.post('/batch',  batchUpsert);
router.get('/history', getHistory);

export default router;
