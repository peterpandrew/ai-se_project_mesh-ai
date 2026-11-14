import type { Request, Response } from 'express';
import type OpenAI from 'openai';
import Chat from '../models/chat.js';
import Message from '../models/message.js';
import { getClient, LLM_MODEL } from '../utils/openai-client.js';

export const getMessages = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user!.userId;
  const chat = await Chat.findOne({ _id: req.params.id, userId });

  if (!chat) {
    res.status(404).json({
      success: false,
      data: null,
      error: 'Chat not found',
    });
    return;
  }

  const messages = await Message.find({ chatId: chat._id }).sort({
    createdAt: 1,
  });

  res.status(200).json({
    success: true,
    data: { chat, messages },
    error: null,
  });
};

export const createMessage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { content } = req.body ?? {};

  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({
      success: false,
      data: null,
      error: 'Message content is required',
    });
    return;
  }

  const chat = await Chat.findOne({
    _id: req.params.id,
    userId: req.user!.userId,
  });

  if (!chat) {
    res.status(404).json({
      success: false,
      data: null,
      error: 'Chat not found',
    });
    return;
  }

  const history = await Message.find({ chatId: chat._id }).sort({
    createdAt: 1,
  });
  const userMessage = await Message.create({
    chatId: chat._id,
    role: 'user',
    content: content.trim(),
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: 'You are a helpful assistant. Respond clearly and concisely.',
    },
    ...history.map(
      (message): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      }),
    ),
    { role: 'user', content: content.trim() },
  ];

  const completion = await getClient().chat.completions.create({
    model: LLM_MODEL,
    messages,
  });
  const responseContent = completion.choices[0]?.message.content;

  if (typeof responseContent !== 'string') {
    throw new Error('The language model returned no text answer');
  }

  const assistantMessage = await Message.create({
    chatId: chat._id,
    role: 'assistant',
    content: responseContent,
  });

  res.status(201).json({
    success: true,
    data: { userMessage, assistantMessage },
    error: null,
  });
};

export default {
  getMessages,
  createMessage,
};
