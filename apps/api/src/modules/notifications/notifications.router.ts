import { Router } from 'express';
import { authGuard } from '../../middleware/auth.js';
import {
  listNotifications,
  unreadCount,
  markOneRead,
  markAllRead,
  removeNotification,
  streamNotifications,
} from './notifications.controller.js';

const router = Router();

// SSE endpoint — auth is handled inside the controller (token via query param)
router.get('/stream', streamNotifications);

// All other routes require standard JWT auth
router.use(authGuard);

router.get('/',                  listNotifications);
router.get('/unread-count',      unreadCount);
router.patch('/:id/read',        markOneRead);
router.patch('/read-all',        markAllRead);
router.delete('/:id',            removeNotification);

export default router;
