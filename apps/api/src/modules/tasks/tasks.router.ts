import { Router } from 'express';
import { authGuard } from '../../middleware/auth.js';
import {
  listTasks, getTask, createTask, updateTask, deleteTask, reorderTasks,
  listComments, addComment, deleteComment,
} from './tasks.controller.js';

const router = Router();
router.use(authGuard);

router.get('/',    listTasks);     // ?projectId=xxx
router.get('/:id', getTask);
router.post('/',   createTask);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);
router.post('/reorder', reorderTasks); // Kanban drag-and-drop

router.get('/:id/comments',    listComments);
router.post('/:id/comments',   addComment);
router.delete('/:id/comments/:commentId', deleteComment);

export default router;
