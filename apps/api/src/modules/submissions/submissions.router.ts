import { Router } from 'express';
import { authGuard } from '../../middleware/auth.js';
import { upload } from '../../lib/storage.js';
import {
  listSubmissions,
  createSubmission,
  reviewSubmission,
  transferTask,
  getProjectContributions,
  listDeliverables,
  createDeliverable,
} from './submissions.controller.js';

const router = Router();
router.use(authGuard);

// Task submissions
router.get('/tasks/:taskId/submissions', listSubmissions);
router.post('/tasks/:taskId/submissions', upload.array('files', 10), createSubmission);
router.post('/tasks/:taskId/transfer', transferTask);

// Submission review
router.patch('/submissions/:submissionId/review', reviewSubmission);

// Project deliverables & contributions
router.get('/projects/:projectId/deliverables', listDeliverables);
router.post('/projects/:projectId/deliverables', upload.single('file'), createDeliverable);
router.get('/projects/:projectId/contributions', getProjectContributions);

export default router;
