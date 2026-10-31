import type { Request, Response } from 'express';

export const getDocuments = (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    data: {},
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

export const createDocument = (_req: Request, res: Response): void => {
  res.status(201).json({
    success: true,
    data: {},
    error: null,
  });
};

export const deleteDocument = (_req: Request, res: Response): void => {
  res.status(204).end();
};
