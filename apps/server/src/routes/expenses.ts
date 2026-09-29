import { Router } from 'express';
import { z } from 'zod';
import { uid } from '../auth/middleware';
import { withTx, type Db } from '../db';
import { expenseCreate, expensePatch, isoTime, listQuery, transitionBody, uuid } from '../lib/schemas';
import {
  createExpense, deleteExpense, getEvents, getExpense, listExpenses, recordReference, transitionExpense, updateExpense,
} from '../services/expenses';

const idParam = z.object({ id: uuid });

export function expensesRouter(db: Db) {
  const r = Router();

  r.post('/', async (req, res) => {
    const body = expenseCreate.parse(req.body);
    const out = await withTx(db, (tx) => createExpense(tx, uid(req), body));
    res.status(out.created ? 201 : 200).json({ expense: out.expense });
  });

  r.get('/', async (req, res) => {
    res.json(await listExpenses(db, uid(req), listQuery.parse(req.query)));
  });

  r.get('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const expense = await getExpense(db, uid(req), id);
    res.json({ expense, events: await getEvents(db, uid(req), id) });
  });

  r.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const patch = expensePatch.parse(req.body);
    res.json({ expense: await withTx(db, (tx) => updateExpense(tx, uid(req), id, patch)) });
  });

  r.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await deleteExpense(db, uid(req), id);
    res.status(204).end();
  });

  /** Slip → UPI app handoff. Records PAYMENT_APP_OPENED (does NOT imply success). */
  r.post('/:id/payment-initiate', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ at: isoTime.optional(), eventId: uuid.optional(), paymentApp: z.string().trim().max(80).optional() }).strict().parse(req.body ?? {});
    const expense = await withTx(db, (tx) => transitionExpense(tx, uid(req), id, { to: 'PAYMENT_APP_OPENED', ...body }));
    res.json({ expense });
  });

  /** Saves UTR / transaction reference and marks the expense PAID. */
  r.post('/:id/utr', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ reference: z.string().min(1).max(64), eventId: uuid.optional(), at: isoTime.optional() }).strict().parse(req.body);
    const expense = await withTx(db, (tx) => recordReference(tx, uid(req), id, body.reference, body.eventId, body.at));
    res.json({ expense });
  });

  /** Generic validated status transition (return, confirm, fail, cancel, unconfirmed…). */
  r.post('/:id/status', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = transitionBody.parse(req.body);
    const expense = await withTx(db, (tx) => transitionExpense(tx, uid(req), id, body));
    res.json({ expense });
  });

  return r;
}
