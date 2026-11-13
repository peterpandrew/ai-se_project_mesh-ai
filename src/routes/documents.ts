import { Router } from 'express';
import multer from 'multer';
import {
  deleteDocument,
  getDocument,
  getDocuments,
  uploadDocument,
} from '../controllers/documents.js';

const documentsRouter = Router();
const upload = multer({ dest: 'uploads/' });

documentsRouter.get('/', getDocuments);
documentsRouter.get('/:id', getDocument);
documentsRouter.post('/', upload.single('file'), uploadDocument);
documentsRouter.delete('/:id', deleteDocument);

export { documentsRouter };
