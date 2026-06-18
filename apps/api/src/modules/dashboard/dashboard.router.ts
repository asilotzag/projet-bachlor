import { Router } from 'express';
import { authGuard, requireRole } from '../../middleware/auth.js';
import { getStats, getHomeDashboard, getAdminDashboard, getRHDashboard, getManagerDashboard, getEmployeeDashboard } from './dashboard.controller.js';

const router = Router();
router.use(authGuard);

router.get('/stats', getStats);
router.get('/home', getHomeDashboard);
router.get('/admin', requireRole('ADMIN'), getAdminDashboard);
router.get('/rh', requireRole('ADMIN', 'RH'), getRHDashboard);
router.get('/manager', requireRole('ADMIN', 'MANAGER'), getManagerDashboard);
router.get('/employee', getEmployeeDashboard);

export default router;
