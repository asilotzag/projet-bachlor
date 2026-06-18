import { Router } from 'express';
import { authGuard } from '../../middleware/auth.js';
import { getCalendarEvents } from './calendar.controller.js';

const router = Router();
router.use(authGuard);

router.get('/events', getCalendarEvents);

export default router;
