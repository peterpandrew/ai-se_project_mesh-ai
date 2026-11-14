import { Router } from 'express';
import {
  createChat,
  deleteChat,
  getChat,
  getChats,
} from '../controllers/chats.js';
import { createMessage, getMessages } from '../controllers/messages.js';

const chatsRouter = Router();

chatsRouter.get('/', getChats);
chatsRouter.get('/:id', getChat);
chatsRouter.get('/:id/messages', getMessages);
chatsRouter.post('/', createChat);
chatsRouter.post('/:id/messages', createMessage);
chatsRouter.delete('/:id', deleteChat);

export { chatsRouter };
