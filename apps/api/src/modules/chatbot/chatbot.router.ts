import { Router } from 'express';
import { authGuard } from '../../middleware/auth.js';
import { listConversations, newConversation, listMessages, postMessage, removeConversation } from './chatbot.controller.js';

const router = Router();
router.use(authGuard);

router.get('/conversations',                  listConversations);
router.post('/conversations',                 newConversation);
router.get('/conversations/:id/messages',     listMessages);
router.post('/conversations/:id/messages',    postMessage);
router.delete('/conversations/:id',           removeConversation);

export default router;
