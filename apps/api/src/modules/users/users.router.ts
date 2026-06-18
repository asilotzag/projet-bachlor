import { Router } from 'express';
import {
  listUsers, getUser, createUser, updateUser, deleteUser,
  getAssignableUsers, getManagerEmployees,
  getMyProfile, updateMyProfile,
} from './users.controller.js';
import { authGuard, requireRole } from '../../middleware/auth.js';

const router = Router();

// ── Self-service (any authenticated user) ─────────────────────────────────────
router.get('/me',  authGuard, getMyProfile);
router.put('/me',  authGuard, updateMyProfile);

// ── Assignable users (any authenticated user) ─────────────────────────────────
router.get('/assignable', authGuard, getAssignableUsers);

// ── User management (ADMIN + RH) ──────────────────────────────────────────────
// RH restrictions (cannot promote to ADMIN) are enforced in the controller.
router.use(authGuard, requireRole('ADMIN', 'RH'));

router.get('/',    listUsers);
router.post('/',   createUser);
router.get('/:id/supervised-employees', getManagerEmployees);
router.get('/:id', getUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
