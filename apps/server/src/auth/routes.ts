import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import type { Db } from '../db';
import { ApiError } from '../lib/errors';
import { issueRefreshToken, revokeRefreshToken, rotateRefreshToken, signAccessToken } from './tokens';

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);

const registerBody = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/).optional().or(z.literal('').transform(() => undefined)),
  password,
}).strict();
const loginBody = z.object({ email, password: z.string().min(1).max(128) }).strict();
const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) }).strict();

// Constant-time-ish behaviour for unknown emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function publicUser(u: { id: string; name: string; email: string; phone: string | null; currency: string; default_category: string | null; created_at: Date }) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, currency: u.currency, defaultCategory: u.default_category, createdAt: u.created_at.toISOString() };
}

export function authRouter(db: Db) {
  const r = Router();

  r.post('/register', async (req, res) => {
    const body = registerBody.parse(req.body);
    const hash = await bcrypt.hash(body.password, config.bcryptRounds);
    const { rows } = await db.query(
      `INSERT INTO users (name, email, phone, password_hash) VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone, currency, default_category, created_at`,
      [body.name, body.email, body.phone ?? null, hash],
    );
    const user = rows[0];
    res.status(201).json({
      user: publicUser(user),
      accessToken: signAccessToken(user.id),
      refreshToken: await issueRefreshToken(db, user.id),
      expiresIn: config.accessTtlSec,
    });
  });

  r.post('/login', async (req, res) => {
    const body = loginBody.parse(req.body);
    const { rows } = await db.query(
      'SELECT id, name, email, phone, currency, default_category, created_at, password_hash FROM users WHERE lower(email) = $1',
      [body.email],
    );
    const user = rows[0];
    const ok = await bcrypt.compare(body.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    res.json({
      user: publicUser(user),
      accessToken: signAccessToken(user.id),
      refreshToken: await issueRefreshToken(db, user.id),
      expiresIn: config.accessTtlSec,
    });
  });

  r.post('/refresh', async (req, res) => {
    const { refreshToken } = refreshBody.parse(req.body);
    const rotated = await rotateRefreshToken(db, refreshToken);
    res.json({ accessToken: signAccessToken(rotated.userId), refreshToken: rotated.refreshToken, expiresIn: config.accessTtlSec });
  });

  r.post('/logout', async (req, res) => {
    const parsed = refreshBody.safeParse(req.body);
    if (parsed.success) await revokeRefreshToken(db, parsed.data.refreshToken);
    res.status(204).end();
  });

  return r;
}
