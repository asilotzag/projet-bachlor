import { Router } from 'express';
import { authGuard } from '../../middleware/auth.js';
import { generateContent, getInsights } from './ai.controller.js';

const router = Router();
router.use(authGuard);

router.post('/generate', generateContent);
router.get('/insights',  getInsights);

export default router;
