import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool } from './db';

const here = dirname(fileURLToPath(import.meta.url));

export async function migrate(db: pg.Pool, dir = join(here, '..', 'migrations')): Promise<string[]> {
  const applied: string[] = [];
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const { rowCount } = await db.query('SELECT 1 FROM schema_migrations WHERE version = $1', [f]);
    if (rowCount) continue;
    const sql = await readFile(join(dir, f), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [f]);
      await client.query('COMMIT');
      applied.push(f);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  return applied;
}

// CLI entry: `npm run migrate` (only when this file itself is the entry point)
if (/migrate\.(ts|js)$/.test(process.argv[1] ?? '')) {
  const db = createPool();
  migrate(db)
    .then((a) => console.log(a.length ? `Applied: ${a.join(', ')}` : 'Database up to date'))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}
