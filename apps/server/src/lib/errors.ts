import type { NextFunction, Request, Response } from 'express';
import { TransitionError } from '@paytrack/shared';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new ApiError(404, 'NOT_FOUND', `${what} not found`);

const TRANSITION_MESSAGES: Record<string, string> = {
  ILLEGAL_TRANSITION: "This payment can't move to that status.",
  REFERENCE_REQUIRED: 'A valid UTR or transaction ID is required.',
  UPI_ID_REQUIRED: 'A UPI ID is required for this payment.',
  AMOUNT_REQUIRED: 'A valid amount is required.',
  MANUAL_ONLY: 'Only manually recorded (non-UPI) expenses can be saved as paid directly.',
};

/** Maps any thrown error to a stable JSON shape: { error: { code, message, details? } } */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) {
    return new ApiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  if (err instanceof TransitionError) {
    return new ApiError(409, err.code, TRANSITION_MESSAGES[err.code] ?? err.message, { from: err.from, to: err.to });
  }
  const pgErr = err as { code?: string; constraint?: string };
  if (pgErr?.code === '23505') {
    if (pgErr.constraint === 'expenses_user_utr_uq' || pgErr.constraint === 'expenses_user_txnref_uq') {
      return new ApiError(409, 'DUPLICATE_REFERENCE', 'Transaction ID already exists.');
    }
    if (pgErr.constraint === 'users_email_lower_uq') return new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    if (pgErr.constraint === 'categories_user_name_uq') return new ApiError(409, 'DUPLICATE_CATEGORY', 'That category already exists.');
    if (pgErr.constraint === 'budgets_user_cat_period_uq') return new ApiError(409, 'DUPLICATE_BUDGET', 'A budget for this category and period already exists.');
    return new ApiError(409, 'CONFLICT', 'This record already exists.');
  }
  if (pgErr?.code === '23514' || pgErr?.code === '22P02') {
    return new ApiError(400, 'INVALID_DATA', 'Some values are not allowed.');
  }
  return new ApiError(500, 'INTERNAL', 'Something went wrong on our side. Please try again.');
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const e = toApiError(err);
  if (e.status >= 500) console.error(err);
  res.status(e.status).json({ error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } });
}
