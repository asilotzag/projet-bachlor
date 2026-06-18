import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { authGuard } from '../../middleware/auth.js';
import * as c from './chat.controller.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.resolve(process.cwd(), 'uploads')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();
router.use(authGuard);

router.get('/users',                               c.listChatUsers);
router.get('/conversations',                       c.listConversations);
router.post('/conversations/direct',               c.getOrCreateDirect);
router.post('/conversations/group',                c.createGroup);
router.post('/conversations/:id/members',          c.addMember);
router.delete('/conversations/:id/members/:userId',c.removeMember);
router.get('/conversations/:id/messages',          c.getMessages);
router.post('/conversations/:id/messages',         upload.single('file'), c.sendMessage);
router.patch('/conversations/:id/read',            c.markRead);
router.patch('/messages/:id',                      c.editMessage);
router.delete('/messages/:id',                     c.deleteMessage);

export default router;
