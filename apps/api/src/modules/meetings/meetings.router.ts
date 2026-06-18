import { Router } from 'express';
import { authGuard } from '../../middleware/auth.js';
import * as c from './meetings.controller.js';

const router = Router();
router.use(authGuard);

router.post('/',                          c.createMeeting);
router.get('/:id',                        c.getMeeting);
router.patch('/:id',                      c.updateMeeting);
router.delete('/:id',                     c.deleteMeeting);
router.post('/:id/attendees',             c.addAttendees);
router.delete('/:id/attendees/:userId',   c.removeAttendee);

export default router;
