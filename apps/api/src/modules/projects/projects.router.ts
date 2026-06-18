import { Router } from 'express';
import { authGuard, requireRole } from '../../middleware/auth.js';
import {
  listProjects, getProject, createProject, updateProject, deleteProject,
  addMember, removeMember,
} from './projects.controller.js';
import { generateTasks, confirmGeneratedTasks } from './generate.controller.js';
import { createProjectFromTemplate } from './templates.controller.js';

const router = Router();
router.use(authGuard);

router.get('/',    listProjects);
router.get('/:id', getProject);
router.post('/',   requireRole('ADMIN', 'MANAGER'), createProject);
router.put('/:id', requireRole('ADMIN', 'MANAGER'), updateProject);
router.delete('/:id', requireRole('ADMIN'), deleteProject);

router.post('/:id/members',          requireRole('ADMIN', 'MANAGER'), addMember);
router.delete('/:id/members/:userId', requireRole('ADMIN', 'MANAGER'), removeMember);

router.post('/:id/generate-tasks', requireRole('ADMIN', 'MANAGER'), generateTasks);
router.post('/:id/confirm-tasks',  requireRole('ADMIN', 'MANAGER'), confirmGeneratedTasks);
router.post('/from-template/:templateId', requireRole('ADMIN', 'MANAGER'), createProjectFromTemplate);

export default router;
