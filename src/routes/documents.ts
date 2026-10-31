import { Router } from 'express';
import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocuments,
} from '../controllers/documents.js';

const documentsRouter = Router();

documentsRouter.get('/', getDocuments);
documentsRouter.get('/:id', getDocument);
documentsRouter.post('/', createDocument);
documentsRouter.delete('/:id', deleteDocument);

export { documentsRouter };
