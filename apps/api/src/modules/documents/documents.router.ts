import { Router } from 'express';
import { authGuard } from '../../middleware/auth.js';
import { upload } from '../../lib/storage.js';
import {
  listDocuments, getDocument, uploadDocument, updateDocument,
  deleteDocument, downloadDocument, addVersion, listVersions,
  getAnalysis, triggerAnalysis, getDocPermissions, setPermissions,
} from './documents.controller.js';

const router = Router();
router.use(authGuard);

router.get('/',           listDocuments);
router.get('/:id',        getDocument);
router.get('/:id/download', downloadDocument);
router.post('/', upload.single('file'), uploadDocument);
router.put('/:id',        updateDocument);
router.delete('/:id',     deleteDocument);

router.get('/:id/versions',              listVersions);
router.post('/:id/versions', upload.single('file'), addVersion);

router.get('/:id/analysis',  getAnalysis);
router.post('/:id/analysis', triggerAnalysis);

router.get('/:id/permissions', getDocPermissions);
router.put('/:id/permissions', setPermissions);

export default router;
