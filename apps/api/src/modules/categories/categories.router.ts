import { Router } from 'express';
import { authGuard, requireRole } from '../../middleware/auth.js';
import { listCategories, createCategory, updateCategory, deleteCategory } from './categories.controller.js';

const router = Router();
router.use(authGuard);

router.get('/', listCategories);
router.post('/', requireRole('ADMIN', 'MANAGER'), createCategory);
router.put('/:id', requireRole('ADMIN', 'MANAGER'), updateCategory);
router.delete('/:id', requireRole('ADMIN'), deleteCategory);

export default router;
