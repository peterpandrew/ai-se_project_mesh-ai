import type { Request, Response } from 'express';

export const getChats = (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    data: {},
    error: null,
  });
};

export const getChat = (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    data: {},
    error: null,
  });
};

export const createChat = (_req: Request, res: Response): void => {
  res.status(201).json({
    success: true,
    data: {},
    error: null,
  });
};

export const createChatMessage = (_req: Request, res: Response): void => {
  res.status(201).json({
    success: true,
    data: {},
    error: null,
  });
};

export const deleteChat = (_req: Request, res: Response): void => {
  res.status(204).end();
};
