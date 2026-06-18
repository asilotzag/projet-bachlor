import { Router } from 'express';
import { authGuard, requireRole } from '../../middleware/auth.js';
import {
  getMyTeam,
  listRequests,
  countPendingRequests,
  createRequest,
  approveRequest,
  rejectRequest,
  getAvailableEmployees,
  removeFromTeam,
} from './supervision.controller.js';

const router = Router();
router.use(authGuard);

router.get('/my-team',          requireRole('ADMIN', 'RH', 'MANAGER'), getMyTeam);
router.get('/requests',         requireRole('ADMIN', 'RH', 'MANAGER'), listRequests);
router.get('/requests/count',   requireRole('ADMIN', 'RH'), countPendingRequests);
router.get('/available-employees', requireRole('MANAGER'), getAvailableEmployees);
router.post('/requests',           requireRole('MANAGER'), createRequest);
router.put('/requests/:id/approve', requireRole('ADMIN', 'RH'), approveRequest);
router.put('/requests/:id/reject',  requireRole('ADMIN', 'RH'), rejectRequest);
router.delete('/remove/:employeeId', requireRole('ADMIN', 'RH'), removeFromTeam);

export default router;
