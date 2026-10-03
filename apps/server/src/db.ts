import pg from 'pg';
import { config } from './config';

// BIGINT (paise sums) fits safely in JS numbers for our bounds.
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(url = config.databaseUrl): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
}

export async function withTx<T>(db: pg.Pool, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
