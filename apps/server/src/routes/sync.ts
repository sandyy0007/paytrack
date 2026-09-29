import { Router } from 'express';
import { z } from 'zod';
import { uid } from '../auth/middleware';
import { withTx, type Db } from '../db';
import { toApiError } from '../lib/errors';
import { budgetBody, categoryBody, expenseCreate, expensePatch, transitionBody, uuid } from '../lib/schemas';
import { createExpense, deleteExpense, recordReference, rowToEvent, rowToExpense, transitionExpense, updateExpense } from '../services/expenses';
import { deleteBudget, rowToBudget, upsertBudget } from './budgets';
import { upsertCategory } from './categories';

/**
 * Offline-first sync. The app queues operations locally (outbox) and pushes
 * them in order. Every op is idempotent (client UUIDs / event ids), so a
 * retried push after a dropped connection is safe.
 */
const op = z.discriminatedUnion('type', [
  z.object({ opId: uuid, type: z.literal('expense.create'), payload: expenseCreate }),
  z.object({ opId: uuid, type: z.literal('expense.update'), payload: z.object({ id: uuid, patch: expensePatch }) }),
  z.object({ opId: uuid, type: z.literal('expense.transition'), payload: transitionBody.extend({ id: uuid }) }),
  z.object({ opId: uuid, type: z.literal('expense.reference'), payload: z.object({ id: uuid, reference: z.string().min(1).max(64), eventId: uuid, at: z.string().datetime({ offset: true }) }) }),
  z.object({ opId: uuid, type: z.literal('expense.delete'), payload: z.object({ id: uuid }) }),
  z.object({ opId: uuid, type: z.literal('budget.upsert'), payload: budgetBody }),
  z.object({ opId: uuid, type: z.literal('budget.delete'), payload: z.object({ id: uuid }) }),
  z.object({ opId: uuid, type: z.literal('category.upsert'), payload: categoryBody.required({ id: true }) }),
]);
const pushBody = z.object({ ops: z.array(z.unknown()).max(200) }).strict();

type OpResult = { opId: string; ok: true } | { opId: string; ok: false; code: string; message: string; retryable: boolean };

export function syncRouter(db: Db) {
  const r = Router();

  r.post('/push', async (req, res) => {
    const userId = uid(req);
    const { ops } = pushBody.parse(req.body);
    const results: OpResult[] = [];
    for (const raw of ops) {
      const parsed = op.safeParse(raw);
      const opId = (raw as { opId?: string })?.opId ?? 'unknown';
      if (!parsed.success) {
        const fields = parsed.error.issues.slice(0, 5).map((i) => i.path.join('.') || '(root)').join(', ');
        results.push({ opId, ok: false, code: 'VALIDATION_ERROR', message: `Invalid operation (${fields})`, retryable: false });
        continue;
      }
      const o = parsed.data;
      try {
        await withTx(db, async (tx) => {
          switch (o.type) {
            case 'expense.create': await createExpense(tx, userId, o.payload); break;
            case 'expense.update': await updateExpense(tx, userId, o.payload.id, o.payload.patch); break;
            case 'expense.transition': {
              const { id, ...t } = o.payload;
              await transitionExpense(tx, userId, id, t);
              break;
            }
            case 'expense.reference': await recordReference(tx, userId, o.payload.id, o.payload.reference, o.payload.eventId, o.payload.at); break;
            case 'expense.delete': await deleteExpense(tx, userId, o.payload.id); break;
            case 'budget.upsert': await upsertBudget(tx, userId, o.payload); break;
            case 'budget.delete': await deleteBudget(tx, userId, o.payload.id); break;
            case 'category.upsert': await upsertCategory(tx, userId, o.payload); break;
          }
        });
        results.push({ opId: o.opId, ok: true });
      } catch (e) {
        const err = toApiError(e);
        results.push({ opId: o.opId, ok: false, code: err.code, message: err.message, retryable: err.status >= 500 });
      }
    }
    res.json({ results });
  });

  r.get('/pull', async (req, res) => {
    const userId = uid(req);
    const since = z.string().datetime({ offset: true }).optional().parse(req.query.since);
    const serverTime = new Date().toISOString();
    const sinceTs = since ?? '1970-01-01T00:00:00Z';
    const [exp, bud, cat] = await Promise.all([
      db.query('SELECT * FROM expenses WHERE user_id = $1 AND server_updated_at > $2 ORDER BY server_updated_at LIMIT 2000', [userId, sinceTs]),
      db.query('SELECT * FROM budgets WHERE user_id = $1 AND server_updated_at > $2', [userId, sinceTs]),
      db.query('SELECT id, name, icon, color, deleted_at FROM categories WHERE user_id = $1 AND updated_at > $2', [userId, sinceTs]),
    ]);
    const ids = exp.rows.map((r) => r.id);
    const ev = ids.length
      ? await db.query('SELECT * FROM expense_events WHERE user_id = $1 AND expense_id = ANY($2) ORDER BY at', [userId, ids])
      : { rows: [] };
    const hasMore = exp.rows.length === 2000;
    const cursor = hasMore ? exp.rows[exp.rows.length - 1].server_updated_at.toISOString() : serverTime;
    res.json({
      expenses: exp.rows.map(rowToExpense),
      events: ev.rows.map(rowToEvent),
      budgets: bud.rows.map(rowToBudget),
      categories: cat.rows.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, deleted: !!c.deleted_at })),
      cursor,
      hasMore,
    });
  });

  return r;
}
