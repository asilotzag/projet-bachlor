import { Router } from 'express';
import { authGuard, requireRole } from '../../middleware/auth.js';
import { listTemplates, getTemplate, createTemplate, deleteTemplate } from '../projects/templates.controller.js';

const router = Router();
router.use(authGuard);

router.get('/',     listTemplates);
router.get('/:id',  getTemplate);
router.post('/',    requireRole('ADMIN', 'MANAGER'), createTemplate);
router.delete('/:id', requireRole('ADMIN'), deleteTemplate);

export default router;
