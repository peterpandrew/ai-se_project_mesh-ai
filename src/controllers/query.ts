import type { Request, Response } from 'express';
import Chunk from '../models/chunk.js';
import Document from '../models/document.js';
import { createEmbedding } from '../utils/embeddings.js';
import {
  buildContext,
  getClient,
  LLM_MODEL,
} from '../utils/openai-client.js';
import { cosineSimilarity } from '../utils/vector-search.js';

const MAX_CONTEXT_CHUNKS = 5;

export const runQuery = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { question } = req.body ?? {};

  if (typeof question !== 'string' || !question.trim()) {
    res.status(400).json({
      success: false,
      data: null,
      error: 'Question is required',
    });
    return;
  }

  const userId = req.user!.userId;
  const documents = await Document.find({ userId });
  let relevantChunks: { text: string }[] = [];

  if (documents.length > 0) {
    const chunks = await Chunk.find({
      documentId: { $in: documents.map((document) => document._id) },
    });

    if (chunks.length > 0) {
      const questionEmbedding = await createEmbedding(question.trim());

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

  const completion = await getClient().chat.completions.create({
    model: LLM_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'Answer using only the supplied uploaded-document context. If it does not contain the answer, say that you could not find the answer in the uploaded documents. Do not invent details.',
      },
      {
        role: 'user',
        content: `Document context:\n${buildContext(relevantChunks)}\n\nQuestion:\n${question.trim()}`,
      },
    ],
  });
  const answer = completion.choices[0]?.message.content;

  if (typeof answer !== 'string') {
    throw new Error('The language model returned no text answer');
  }

  res.status(200).json({
    success: true,
    data: { answer },
    error: null,
  });
};
