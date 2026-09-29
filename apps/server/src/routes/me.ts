import { Router } from 'express';
import { z } from 'zod';
import { publicUser } from '../auth/routes';
import { uid } from '../auth/middleware';
import type { Db } from '../db';
import { notFound } from '../lib/errors';
import { categoryName } from '../lib/schemas';

const patchBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/).nullable().optional(),
  defaultCategory: categoryName.nullable().optional(),
}).strict();

export function meRouter(db: Db) {
  const r = Router();
  const COLS = 'id, name, email, phone, currency, default_category, created_at';
  r.get('/', async (req, res) => {
    const { rows } = await db.query(`SELECT ${COLS} FROM users WHERE id = $1`, [uid(req)]);
    if (!rows[0]) throw notFound('User');
    res.json({ user: publicUser(rows[0]) });
  });
  r.patch('/', async (req, res) => {
    const b = patchBody.parse(req.body);
    const { rows } = await db.query(
      `UPDATE users SET name = COALESCE($2, name),
         phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
         default_category = CASE WHEN $5::boolean THEN $6 ELSE default_category END,
         updated_at = now()
       WHERE id = $1 RETURNING ${COLS}`,
      [uid(req), b.name ?? null, b.phone !== undefined, b.phone ?? null, b.defaultCategory !== undefined, b.defaultCategory ?? null],
    );
    res.json({ user: publicUser(rows[0]) });
  });
  /** Permanently deletes the account and all data (cascade). */
  r.delete('/', async (req, res) => {
    await db.query('DELETE FROM users WHERE id = $1', [uid(req)]);
    res.status(204).end();
  });
  return r;
}
