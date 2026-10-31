import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (req, res): void => {
  res.status(404).json({
    success: false,
    data: null,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  });
};

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
): void => {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error(error);
  res.status(500).json({
    success: false,
    data: null,
    error: 'An error has occurred on the server',
  });
};
