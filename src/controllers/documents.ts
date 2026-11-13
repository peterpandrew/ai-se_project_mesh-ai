import { readFile } from 'node:fs/promises';
import type { Request, Response } from 'express';
import { PDFParse } from 'pdf-parse';
import { chunkText } from '../utils/chunk.js';
import { createEmbedding } from '../utils/embeddings.js';
import Document from '../models/document.js';
import Chunk from '../models/chunk.js';

export const getDocuments = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const documents = await Document.find({ userId: req.user!.userId });

  res.status(200).json({
    success: true,
    data: documents,
    error: null,
  });
};

export const getDocument = (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    data: {},
    error: null,
  });
};

export const uploadDocument = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.file) {
    res.status(400).json({
      success: false,
      data: null,
      error: 'A file is required',
    });
    return;
  }

  const parser = new PDFParse({ data: await readFile(req.file.path) });
  let text: string;
  try {
    text = (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }

  const document = await Document.create({
    title: req.file.originalname,
    fileName: req.file.filename,
    userId: req.user!.userId,
  });
  const chunks = chunkText(text);

  await Promise.all(
    chunks.map(async (chunkTextValue) => {
      const embedding = await createEmbedding(chunkTextValue);
      return Chunk.create({
        documentId: document._id,
        text: chunkTextValue,
        embedding,
      });
    }),
  );

  res.status(201).json({
    success: true,
    data: document,
    error: null,
  });
};

export const deleteDocument = (_req: Request, res: Response): void => {
  res.status(204).end();
};
