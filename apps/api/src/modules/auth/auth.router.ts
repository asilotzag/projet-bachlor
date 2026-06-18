import { Router } from 'express';
import { login, getMe } from './auth.controller.js';
import { authGuard } from '../../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.get('/me', authGuard, getMe);

export default router;
