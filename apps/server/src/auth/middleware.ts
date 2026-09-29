import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors';
import { verifyAccessToken } from './tokens';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(new ApiError(401, 'UNAUTHORIZED', 'Please sign in to continue.'));
  try {
    req.userId = verifyAccessToken(h.slice(7));
    next();
  } catch (e) {
    next(e);
  }
}

export function uid(req: Request): string {
  if (!req.userId) throw new ApiError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  return req.userId;
}
