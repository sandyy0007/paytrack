import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { Queryable } from '../db';
import { ApiError } from '../lib/errors';

export interface AccessClaims {
  sub: string;
  typ: 'access';
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ typ: 'access' }, config.jwtSecret, {
    subject: userId,
    expiresIn: config.accessTtlSec,
    algorithm: 'HS256',
    issuer: 'paytrack',
  });
}

export function verifyAccessToken(token: string): string {
  try {
    const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: 'paytrack' }) as jwt.JwtPayload;
    if (p.typ !== 'access' || typeof p.sub !== 'string') throw new Error('bad token');
    return p.sub;
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function issueRefreshToken(db: Queryable, userId: string): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [userId, sha256(token), config.refreshTtlDays],
  );
  return token;
}

/** Rotates a refresh token. Reuse of a revoked token revokes the whole family (all user sessions). */
export async function rotateRefreshToken(db: Queryable, token: string): Promise<{ userId: string; refreshToken: string }> {
  const { rows } = await db.query<{ id: string; user_id: string; revoked_at: Date | null; expires_at: Date }>(
    'SELECT id, user_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = $1',
    [sha256(token)],
  );
  const row = rows[0];
  const invalid = new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
  if (!row) throw invalid;
  if (row.revoked_at) {
    await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [row.user_id]);
    throw invalid;
  }
  if (row.expires_at.getTime() < Date.now()) throw invalid;
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
  return { userId: row.user_id, refreshToken: await issueRefreshToken(db, row.user_id) };
}

export async function revokeRefreshToken(db: Queryable, token: string): Promise<void> {
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(token)]);
}
