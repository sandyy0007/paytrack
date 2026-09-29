import { Router } from 'express';
import { z } from 'zod';
import { uid } from '../auth/middleware';
import type { Db, Queryable } from '../db';
import { notFound } from '../lib/errors';
import { budgetBody, uuid } from '../lib/schemas';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rowToBudget = (r: any) => ({
  id: r.id, category: r.category, amountPaise: Number(r.amount_paise), period: r.period, thresholds: r.thresholds,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(), deletedAt: r.deleted_at?.toISOString() ?? null,
});

export async function upsertBudget(db: Queryable, userId: string, b: z.infer<typeof budgetBody>) {
  const { rows } = await db.query(
    `INSERT INTO budgets (id, user_id, category, amount_paise, period, thresholds) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, amount_paise = EXCLUDED.amount_paise, period = EXCLUDED.period,
       thresholds = EXCLUDED.thresholds, updated_at = now(), server_updated_at = clock_timestamp()
       WHERE budgets.user_id = EXCLUDED.user_id
     RETURNING *`,
    [b.id, userId, b.category, b.amountPaise, b.period, b.thresholds],
  );
  if (!rows[0]) throw notFound('Budget');
  return rowToBudget(rows[0]);
}

export async function deleteBudget(db: Queryable, userId: string, id: string) {
  await db.query(
    'UPDATE budgets SET deleted_at = now(), updated_at = now(), server_updated_at = clock_timestamp() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [id, userId],
  );
}

export function budgetsRouter(db: Db) {
  const r = Router();
  r.get('/', async (req, res) => {
    const { rows } = await db.query('SELECT * FROM budgets WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at', [uid(req)]);
    res.json({ budgets: rows.map(rowToBudget) });
  });
  r.post('/', async (req, res) => {
    res.status(201).json({ budget: await upsertBudget(db, uid(req), budgetBody.parse(req.body)) });
  });
  r.patch('/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const patch = budgetBody.omit({ id: true }).partial().parse(req.body);
    const { rows } = await db.query('SELECT * FROM budgets WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, uid(req)]);
    if (!rows[0]) throw notFound('Budget');
    const cur = rowToBudget(rows[0]);
    res.json({ budget: await upsertBudget(db, uid(req), { ...cur, ...patch, id }) });
  });
  r.delete('/:id', async (req, res) => {
    await deleteBudget(db, uid(req), uuid.parse(req.params.id));
    res.status(204).end();
  });
  return r;
}
