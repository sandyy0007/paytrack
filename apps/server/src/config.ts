function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to at least 32 characters in production');
}

export const config = {
  isProd,
  port: num(env.PORT, 4000),
  databaseUrl: env.DATABASE_URL ?? 'postgres://paytrack:paytrack@localhost:5432/paytrack',
  jwtSecret: env.JWT_SECRET ?? 'dev-only-secret-do-not-use-in-production-000000',
  accessTtlSec: num(env.ACCESS_TOKEN_TTL_SECONDS, 900),
  refreshTtlDays: num(env.REFRESH_TOKEN_TTL_DAYS, 30),
  corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY ?? (isProd ? '1' : '0'),
  bcryptRounds: num(env.BCRYPT_ROUNDS, 12),
};
