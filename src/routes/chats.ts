import { Router } from 'express';
import {
  createChat,
  createChatMessage,
  deleteChat,
  getChat,
  getChats,
} from '../controllers/chats.js';

const chatsRouter = Router();

chatsRouter.get('/', getChats);
chatsRouter.get('/:id', getChat);
chatsRouter.post('/', createChat);
chatsRouter.post('/:id/messages', createChatMessage);
chatsRouter.delete('/:id', deleteChat);

export { chatsRouter };
