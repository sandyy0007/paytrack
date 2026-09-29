import * as Crypto from 'expo-crypto';
import { formatExpenseCode } from '@paytrack/shared';
import { kvGet, kvSet, type Tx } from './db';

export const uuid = (): string => Crypto.randomUUID();

/** EXP-YYYYMMDD-NNNN with a per-day local sequence. */
export async function nextExpenseCode(now: Date, tx?: Tx): Promise<string> {
  const day = formatExpenseCode(now, 0).slice(4, 12);
  const key = `seq:${day}`;
  const cur = Number((await kvGet(key)) ?? '0') + 1;
  await kvSet(key, String(cur), tx);
  return formatExpenseCode(now, cur);
}
