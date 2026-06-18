import { Router } from 'express';
import { authGuard } from '../../middleware/auth.js';
import { getJournal, generateReport } from './journal.controller.js';

const router = Router();
router.use(authGuard);

router.get('/users/:userId/journal', getJournal);
router.post('/users/:userId/journal/report', generateReport);

export default router;
