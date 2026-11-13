import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

const unauthorized = (res: Parameters<RequestHandler>[1]): void => {
  res.status(401).json({
    success: false,
    data: null,
    error: 'Authentication required',
  });
};

const hasUserId = (
  payload: string | jwt.JwtPayload,
): payload is jwt.JwtPayload & { userId: string } =>
  typeof payload === 'object' &&
  payload !== null &&
  typeof payload.userId === 'string' &&
  payload.userId.length > 0;

export const authenticateToken: RequestHandler = (req, res, next): void => {
  const authorization = req.get('authorization');

  if (!authorization || !authorization.startsWith('Bearer ')) {
    unauthorized(res);
    return;
  }

  const [scheme, token, ...extra] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token || extra.length > 0) {
    unauthorized(res);
    return;
  }

  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    unauthorized(res);
    return;
  }

  if (!hasUserId(payload)) {
    unauthorized(res);
    return;
  }

  req.user = payload;
  next();
};
