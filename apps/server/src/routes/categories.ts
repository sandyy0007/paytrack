import { DEFAULT_CATEGORIES } from '@paytrack/shared';
import { Router } from 'express';
import { uid } from '../auth/middleware';
import type { Db, Queryable } from '../db';
import { notFound } from '../lib/errors';
import { categoryBody } from '../lib/schemas';
import type { z } from 'zod';

/** Idempotent create (client-generated id). */
export async function upsertCategory(db: Queryable, userId: string, body: z.infer<typeof categoryBody>) {
  const { rows } = await db.query(
    `INSERT INTO categories (id, user_id, name, icon, color) VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, color = EXCLUDED.color, updated_at = now()
       WHERE categories.user_id = EXCLUDED.user_id
     RETURNING id, name, icon, color`,
    [body.id ?? null, userId, body.name, body.icon, body.color],
  );
  if (!rows[0]) throw notFound('Category');
  return { ...rows[0], isDefault: false };
}

export function categoriesRouter(db: Db) {
  const r = Router();
  r.get('/', async (req, res) => {
    const { rows } = await db.query(
      'SELECT id, name, icon, color FROM categories WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at',
      [uid(req)],
    );
    res.json({
      categories: [
        ...DEFAULT_CATEGORIES.map((c) => ({ id: `default:${c.name}`, ...c, isDefault: true })),
        ...rows.map((c) => ({ ...c, isDefault: false })),
      ],
    });
  });
  r.post('/', async (req, res) => {
    res.status(201).json({ category: await upsertCategory(db, uid(req), categoryBody.parse(req.body)) });
  });
  return r;
}
