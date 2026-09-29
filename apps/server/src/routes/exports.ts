import { expensesToCsv } from '@paytrack/shared';
import { Router } from 'express';
import { z } from 'zod';
import { uid } from '../auth/middleware';
import type { Db } from '../db';
import { rowToExpense } from '../services/expenses';

const body = z.object({
  format: z.enum(['csv']).default('csv'), // PDF is rendered on-device from the same data
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  tz: z.number().int().min(-720).max(840).default(330),
}).strict();

export function exportsRouter(db: Db) {
  const r = Router();
  r.post('/', async (req, res) => {
    const b = body.parse(req.body ?? {});
    const { rows } = await db.query(
      `SELECT * FROM expenses WHERE user_id = $1 AND deleted_at IS NULL
         AND ($2::timestamptz IS NULL OR expense_date >= $2) AND ($3::timestamptz IS NULL OR expense_date < $3)
       ORDER BY expense_date DESC LIMIT 50000`,
      [uid(req), b.from ?? null, b.to ?? null],
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="paytrack-expenses.csv"');
    res.send(expensesToCsv(rows.map(rowToExpense), b.tz));
  });
  return r;
}
