import type { Request, Response } from 'express';
import type OpenAI from 'openai';
import Chat from '../models/chat.js';
import Chunk from '../models/chunk.js';
import Document from '../models/document.js';
import Message from '../models/message.js';
import { createEmbedding } from '../utils/embeddings.js';
import {
  buildContext,
  getClient,
  LLM_MODEL,
} from '../utils/openai-client.js';
import { cosineSimilarity } from '../utils/vector-search.js';

const MAX_CONTEXT_CHUNKS = 5;

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
      error: { message: 'Chat not found' },
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
  const { question } = req.body ?? {};

  if (typeof question !== 'string' || !question.trim()) {
    res.status(400).json({
      success: false,
      data: null,
      error: { message: 'Question is required' },
    });
    return;
  }

  const trimmedQuestion = question.trim();
  const userId = req.user!.userId;

  const chat = await Chat.findOne({
    _id: req.params.id,
    userId,
  });

  if (!chat) {
    res.status(404).json({
      success: false,
      data: null,
      error: { message: 'Chat not found' },
    });
    return;
  }

  const documents = await Document.find({ userId });
  let relevantChunks: { text: string }[] = [];

  if (documents.length > 0) {
    const chunks = await Chunk.find({
      documentId: { $in: documents.map((document) => document._id) },
    });

    if (chunks.length > 0) {
      const questionEmbedding = await createEmbedding(trimmedQuestion);

      relevantChunks = chunks
        .map((chunk) => ({
          chunk,
          score: cosineSimilarity(chunk.embedding, questionEmbedding),
        }))
        .filter(
          (
            result,
          ): result is {
            chunk: (typeof chunks)[number];
            score: number;
          } => result.score !== undefined,
        )
        .sort((left, right) => right.score - left.score)
        .slice(0, MAX_CONTEXT_CHUNKS)
        .map(({ chunk }) => ({ text: chunk.text }));
    }
  }

  const history = await Message.find({ chatId: chat._id }).sort({
    createdAt: 1,
  });

  const userMessage = await Message.create({
    chatId: chat._id,
    role: 'user',
    content: trimmedQuestion,
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content:
        'Answer using only the supplied uploaded-document context. If it does not contain the answer, say that you could not find the answer in the uploaded documents. Do not invent details.',
    },
    ...history.map(
      (message): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      }),
    ),
    {
      role: 'user',
      content: `Document context:\n${buildContext(relevantChunks)}\n\nQuestion:\n${trimmedQuestion}`,
    },
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
    data: [userMessage, assistantMessage],
    error: null,
  });
};

export default {
  getMessages,
  createMessage,
};

