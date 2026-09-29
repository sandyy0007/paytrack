import { buildInsights, summarize, type AnalyticsExpense } from '@paytrack/shared';
import { Router } from 'express';
import { uid } from '../auth/middleware';
import type { Db } from '../db';
import { tzQuery } from '../lib/schemas';

async function load(db: Db, userId: string): Promise<AnalyticsExpense[]> {
  const { rows } = await db.query(
    `SELECT amount_paise, status, category, payee_name, upi_id, expense_date
       FROM expenses
      WHERE user_id = $1 AND deleted_at IS NULL
        AND (expense_date >= now() - interval '200 days' OR status NOT IN ('PAID','CANCELLED','FAILED'))`,
    [userId],
  );
  return rows.map((r) => ({
    amountPaise: Number(r.amount_paise), status: r.status, category: r.category,
    payeeName: r.payee_name, upiId: r.upi_id, expenseDate: r.expense_date.toISOString(),
  }));
}

export function analyticsRouter(db: Db) {
  const r = Router();
  r.get('/summary', async (req, res) => {
    const { tz } = tzQuery.parse(req.query);
    const s = summarize(await load(db, uid(req)), new Date(), tz);
    res.json({ summary: s, insights: buildInsights(s) });
  });
  r.get('/categories', async (req, res) => {
    const { tz } = tzQuery.parse(req.query);
    res.json({ categories: summarize(await load(db, uid(req)), new Date(), tz).categories });
  });
  r.get('/trends', async (req, res) => {
    const { tz } = tzQuery.parse(req.query);
    const s = summarize(await load(db, uid(req)), new Date(), tz);
    res.json({ daily: s.daily, monthly: s.monthly });
  });
  return r;
}
