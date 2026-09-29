import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { requireAuth } from './auth/middleware';
import { authRouter } from './auth/routes';
import { config } from './config';
import type { Db } from './db';
import { ApiError, errorHandler } from './lib/errors';
import { analyticsRouter } from './routes/analytics';
import { budgetsRouter } from './routes/budgets';
import { categoriesRouter } from './routes/categories';
import { expensesRouter } from './routes/expenses';
import { exportsRouter } from './routes/exports';
import { meRouter } from './routes/me';
import { syncRouter } from './routes/sync';

export function createApp(db: Db, opts: { rateLimit?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json({ limit: '512kb' }));

  if (opts.rateLimit !== false) {
    app.use(rateLimit({ windowMs: 15 * 60_000, limit: 1000, standardHeaders: 'draft-8', legacyHeaders: false }));
    app.use('/auth', rateLimit({
      windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' } }),
    }));
  }

  app.get('/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ ok: true });
  });

  app.use('/auth', authRouter(db));
  app.use('/me', requireAuth, meRouter(db));
  app.use('/expenses', requireAuth, expensesRouter(db));
  app.use('/analytics', requireAuth, analyticsRouter(db));
  app.use('/budgets', requireAuth, budgetsRouter(db));
  app.use('/categories', requireAuth, categoriesRouter(db));
  app.use('/exports', requireAuth, exportsRouter(db));
  app.use('/sync', requireAuth, syncRouter(db));

  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Route not found')));
  app.use(errorHandler);
  return app;
}
