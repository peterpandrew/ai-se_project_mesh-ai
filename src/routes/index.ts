import { Router } from 'express';
import { authRouter } from './auth.js';
import { chatsRouter } from './chats.js';
import { documentsRouter } from './documents.js';
import { queryRouter } from './query.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/chats', authenticateToken, chatsRouter);
router.use('/documents', authenticateToken, documentsRouter);
router.use('/query', authenticateToken, queryRouter);

export default router;
