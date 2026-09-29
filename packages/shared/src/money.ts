/**
 * Money helpers. All amounts are stored and transmitted as integer paise
 * to avoid floating-point drift (₹850.50 === 85050 paise).
 */

export const MIN_AMOUNT_PAISE = 100; // ₹1
/** Hard upper bound accepted by PayTrack. Individual UPI apps/banks may enforce lower limits. */
export const MAX_AMOUNT_PAISE = 10_00_000_00; // ₹10,00,000
/** Above this we show a soft "check the amount" warning (common P2P UPI limit). */
export const HIGH_AMOUNT_WARNING_PAISE = 1_00_000_00; // ₹1,00,000

const AMOUNT_RE = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

export type AmountParseError = 'EMPTY' | 'INVALID_FORMAT' | 'TOO_SMALL' | 'TOO_LARGE';

export type AmountParseResult =
  | { ok: true; paise: number }
  | { ok: false; error: AmountParseError };

/** Parses user/QR supplied rupee strings like "850", "850.5", "1,250.00". */
export function parseRupeesToPaise(input: string | null | undefined): AmountParseResult {
  if (input == null) return { ok: false, error: 'EMPTY' };
  const cleaned = String(input).trim().replace(/[,\s₹]/g, '');
  if (cleaned === '') return { ok: false, error: 'EMPTY' };
  const m = AMOUNT_RE.exec(cleaned);
  if (!m) return { ok: false, error: 'INVALID_FORMAT' };
  const rupees = Number(m[1]);
  const fraction = (m[2] ?? '').padEnd(2, '0');
  const paise = rupees * 100 + Number(fraction || '0');
  if (paise < MIN_AMOUNT_PAISE) return { ok: false, error: 'TOO_SMALL' };
  if (paise > MAX_AMOUNT_PAISE) return { ok: false, error: 'TOO_LARGE' };
  return { ok: true, paise };
}

export function isValidAmountPaise(paise: unknown): paise is number {
  return (
    typeof paise === 'number' &&
    Number.isInteger(paise) &&
    paise >= MIN_AMOUNT_PAISE &&
    paise <= MAX_AMOUNT_PAISE
  );
}

/** "85050" -> "850.50"; used for UPI `am` parameter. */
export function paiseToDecimalString(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  return `${rupees}.${String(p).padStart(2, '0')}`;
}

/** Indian digit grouping (12,34,567) without relying on Intl availability. */
function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

export interface FormatOptions {
  /** 'auto' shows decimals only when non-zero. */
  decimals?: 'auto' | 'always' | 'never';
  symbol?: boolean;
}

export function formatINR(paise: number, opts: FormatOptions = {}): string {
  const { decimals = 'auto', symbol = true } = opts;
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  let out = groupIndian(String(rupees));
  if (decimals === 'always' || (decimals === 'auto' && p !== 0)) {
    out += '.' + String(p).padStart(2, '0');
  }
  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${out}`;
}

/** Compact form for chart axes: ₹1.2K, ₹3.4L, ₹1.1Cr */
export function formatINRCompact(paise: number): string {
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${trim(r / 1_00_00_000)}Cr`;
  if (r >= 1_00_000) return `₹${trim(r / 1_00_000)}L`;
  if (r >= 1_000) return `₹${trim(r / 1_000)}K`;
  return `₹${Math.round(r)}`;
}
function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}
