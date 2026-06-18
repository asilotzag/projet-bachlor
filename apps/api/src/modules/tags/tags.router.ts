import { Router } from 'express';
import { authGuard, requireRole } from '../../middleware/auth.js';
import { listTags, createTag, deleteTag } from './tags.controller.js';

const router = Router();
router.use(authGuard);

router.get('/',    listTags);
router.post('/',   requireRole('ADMIN', 'MANAGER', 'RH'), createTag);
router.delete('/:id', requireRole('ADMIN'), deleteTag);

export default router;
