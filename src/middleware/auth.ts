import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

// 1. Update the helper to accept a specific error message
const unauthorized = (
  res: Parameters<RequestHandler>[1],
  message: string,
): void => {
  res.status(401).json({
    success: false,
    data: null,
    error: message,
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

  // 2. Check if the header or token is missing altogether
  if (!authorization) {
    unauthorized(res, 'No token provided');
    return;
  }

  // 3. Check if the Bearer format is malformed
  if (!authorization.startsWith('Bearer ')) {
    unauthorized(res, 'Malformed token format');
    return;
  }

  const [scheme, token, ...extra] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token || extra.length > 0) {
    unauthorized(res, 'Malformed token');
    return;
  }

  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!);
  } catch (err) {
    // 4. Differentiate between an expired token and an invalid/tampered token
    if (err instanceof jwt.TokenExpiredError) {
      unauthorized(res, 'Token expired');
      return;
    }
    unauthorized(res, 'Invalid token');
    return;
  }

  // 5. Check if the decoded token is missing expected data
  if (!hasUserId(payload)) {
    unauthorized(res, 'Invalid token payload');
    return;
  }

  req.user = payload;
  next();
};

