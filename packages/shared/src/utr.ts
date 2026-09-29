/**
 * UTR / transaction reference handling.
 * UPI UTRs (RRNs) are 12 digits. Some apps show an alphanumeric transaction ID
 * instead; we accept those as `transactionReference`.
 */

export type ReferenceResult =
  | { ok: true; kind: 'UTR'; value: string }
  | { ok: true; kind: 'TXN_REF'; value: string }
  | { ok: false; error: 'EMPTY' | 'INVALID' ; message: string };

export function normalizeReference(input: string): string {
  return input.replace(/[\s\-]/g, '').toUpperCase();
}

export function classifyReference(input: string | null | undefined): ReferenceResult {
  const v = normalizeReference(input ?? '');
  if (!v) return { ok: false, error: 'EMPTY', message: 'Enter the UTR or transaction ID from your UPI app.' };
  if (/^\d{12}$/.test(v)) return { ok: true, kind: 'UTR', value: v };
  if (/^[A-Z0-9]{8,35}$/.test(v) && /\d/.test(v) && !/^\d+$/.test(v)) {
    return { ok: true, kind: 'TXN_REF', value: v };
  }
  if (/^\d+$/.test(v)) {
    return { ok: false, error: 'INVALID', message: 'A UPI UTR is exactly 12 digits. Please check the number.' };
  }
  return {
    ok: false,
    error: 'INVALID',
    message: "That doesn't look like a UTR (12 digits) or transaction ID (8–35 letters and numbers).",
  };
}

export function isValidUtr(v: unknown): v is string {
  return typeof v === 'string' && /^\d{12}$/.test(v);
}
export function isValidTxnRef(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Z0-9]{8,35}$/.test(v);
}

/**
 * Plausibility score for a 12-digit number as an RRN (YDDDHHNNNNNN).
 * Used only to rank clipboard suggestions — never to reject user input.
 */
function rrnPlausibility(d: string, now: Date): number {
  let score = 0;
  const y = Number(d[0]);
  const ddd = Number(d.slice(1, 4));
  const hh = Number(d.slice(4, 6));
  if (y === now.getFullYear() % 10 || y === (now.getFullYear() - 1) % 10) score += 1;
  if (ddd >= 1 && ddd <= 366) score += 1;
  if (hh <= 23) score += 1;
  if (/^91[6-9]\d{9}$/.test(d)) score -= 2; // looks like +91 phone number
  return score;
}

/** Finds likely UTRs in free text (e.g. clipboard). Returns best first, max 3. */
export function extractUtrCandidates(text: string | null | undefined, now: Date = new Date()): string[] {
  if (!text) return [];
  const found = new Set<string>();
  // No look-behind (older Hermes engines): capture a leading non-digit instead.
  const re = /(^|\D)(\d{12})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text.slice(0, 5000))) !== null) if (m[2]) found.add(m[2]);
  return [...found]
    .map((d) => ({ d, s: rrnPlausibility(d, now) }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.d);
}
