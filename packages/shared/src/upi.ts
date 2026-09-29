/**
 * UPI QR parsing and payment-intent construction.
 *
 * PayTrack only READS what the QR encodes. It does not and cannot verify that
 * the payee account is real, active or trustworthy — that is the job of the
 * UPI app / bank. Everything returned here is "details read from scanned QR".
 */
import { MAX_AMOUNT_PAISE, paiseToDecimalString, parseRupeesToPaise } from './money';

export const VPA_RE = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,255}@[a-zA-Z][a-zA-Z0-9.\-]{1,63}$/;

export function isValidVpa(v: string | null | undefined): v is string {
  return typeof v === 'string' && VPA_RE.test(v.trim());
}

export type UpiQrErrorCode =
  | 'EMPTY'
  | 'NOT_UPI'
  | 'UNSUPPORTED_UPI_ACTION'
  | 'MISSING_PAYEE_ADDRESS'
  | 'INVALID_PAYEE_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'UNSUPPORTED_CURRENCY'
  | 'INVALID_BHARAT_QR';

export const UPI_QR_ERROR_MESSAGES: Record<UpiQrErrorCode, string> = {
  EMPTY: 'The QR code appears to be empty. Try scanning again.',
  NOT_UPI: "This isn't a UPI payment QR. Scan the recipient's UPI QR code.",
  UNSUPPORTED_UPI_ACTION: 'This UPI QR is for a mandate or collect request, which PayTrack does not support.',
  MISSING_PAYEE_ADDRESS: "This QR doesn't include a UPI ID, so a payment can't be prepared.",
  INVALID_PAYEE_ADDRESS: "The UPI ID in this QR doesn't look valid.",
  INVALID_AMOUNT: 'The amount encoded in this QR is not valid.',
  UNSUPPORTED_CURRENCY: 'This QR requests a currency other than INR, which UPI does not support.',
  INVALID_BHARAT_QR: "This Bharat QR code couldn't be read correctly. Try scanning again.",
};

export interface UpiPayload {
  /** Payee VPA / UPI ID (pa). */
  pa: string;
  /** Payee name (pn) — may be absent. */
  pn?: string;
  /** Amount in paise if encoded (am). */
  amountPaise?: number;
  /** Minimum amount in paise if encoded (mam). */
  minAmountPaise?: number;
  currency: 'INR';
  /** Transaction note (tn). */
  note?: string;
  /** Merchant transaction reference (tr). */
  tr?: string;
  /** Merchant category code (mc). */
  mc?: string;
  /** True when a merchant code or signature is present. */
  isMerchant: boolean;
  /** True when PayTrack must not change the amount (signed / merchant QR with fixed amount). */
  amountLocked: boolean;
  /** All original parameters (lower-cased keys), preserved for the intent. */
  params: Record<string, string>;
  source: 'UPI_URI' | 'BHARAT_QR';
}

export type UpiParseResult =
  | { ok: true; payload: UpiPayload }
  | { ok: false; error: UpiQrErrorCode; message: string };

function fail(error: UpiQrErrorCode): UpiParseResult {
  return { ok: false, error, message: UPI_QR_ERROR_MESSAGES[error] };
}

function safeDecode(s: string): string {
  const plusFixed = s.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(plusFixed);
  } catch {
    return plusFixed;
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function sanitizeText(s: string | undefined, max: number): string | undefined {
  if (s == null) return undefined;
  const t = s.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return t.length ? t : undefined;
}

function parseQuery(q: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of q.split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = (i === -1 ? part : part.slice(0, i)).trim().toLowerCase();
    const v = i === -1 ? '' : safeDecode(part.slice(i + 1));
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

function fromParams(params: Record<string, string>, source: UpiPayload['source']): UpiParseResult {
  const pa = (params.pa ?? '').trim();
  if (!pa) return fail('MISSING_PAYEE_ADDRESS');
  if (!isValidVpa(pa)) return fail('INVALID_PAYEE_ADDRESS');

  const cu = (params.cu ?? 'INR').trim().toUpperCase();
  if (cu && cu !== 'INR' && cu !== '356') return fail('UNSUPPORTED_CURRENCY');

  let amountPaise: number | undefined;
  if (params.am != null && params.am.trim() !== '') {
    const r = parseRupeesToPaise(params.am);
    if (!r.ok) {
      // "0" / "0.00" is sometimes used by static QRs to mean "no fixed amount".
      if (/^0+(\.0+)?$/.test(params.am.trim())) amountPaise = undefined;
      else return fail('INVALID_AMOUNT');
    } else amountPaise = r.paise;
  }

  let minAmountPaise: number | undefined;
  if (params.mam != null && params.mam.trim() !== '') {
    const r = parseRupeesToPaise(params.mam);
    if (r.ok) minAmountPaise = r.paise;
  }

  const mc = params.mc?.trim() || undefined;
  const isMerchant = Boolean((mc && mc !== '0000') || params.sign);
  const amountLocked = amountPaise != null && (Boolean(params.sign) || isMerchant);

  return {
    ok: true,
    payload: {
      pa,
      pn: sanitizeText(params.pn, 100),
      amountPaise,
      minAmountPaise,
      currency: 'INR',
      note: sanitizeText(params.tn, 80),
      tr: params.tr?.trim() || undefined,
      mc,
      isMerchant,
      amountLocked,
      params,
      source,
    },
  };
}

/** Parses a raw scanned string into a UPI payload. Supports upi:// URIs and EMV Bharat QR. */
export function parseUpiQr(raw: string | null | undefined): UpiParseResult {
  const text = (raw ?? '').trim();
  if (!text) return fail('EMPTY');

  const lower = text.toLowerCase();
  if (lower.startsWith('upi:')) {
    const m = /^upi:\/\/([a-z]+)\/?\??(.*)$/is.exec(text);
    if (!m) return fail('NOT_UPI');
    const action = (m[1] ?? '').toLowerCase();
    if (action !== 'pay') return fail('UNSUPPORTED_UPI_ACTION');
    return fromParams(parseQuery(m[2] ?? ''), 'UPI_URI');
  }

  if (/^000201/.test(text)) return parseBharatQr(text);

  return fail('NOT_UPI');
}

/* ---------------------------- EMV / Bharat QR ---------------------------- */

export interface Tlv {
  tag: string;
  value: string;
}

export function parseTlv(s: string): Tlv[] | null {
  const out: Tlv[] = [];
  let i = 0;
  while (i < s.length) {
    if (i + 4 > s.length) return null;
    const tag = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len)) return null;
    const value = s.slice(i + 4, i + 4 + len);
    if (value.length !== len) return null;
    out.push({ tag, value });
    i += 4 + len;
  }
  return out;
}

/** CRC-16/CCITT-FALSE as required by EMVCo merchant-presented QR. */
export function crc16ccitt(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function parseBharatQr(text: string): UpiParseResult {
  const tlvs = parseTlv(text);
  if (!tlvs) return fail('INVALID_BHARAT_QR');

  const crcTag = tlvs.find((t) => t.tag === '63');
  if (crcTag) {
    const idx = text.lastIndexOf('6304');
    if (idx === -1 || crc16ccitt(text.slice(0, idx + 4)) !== crcTag.value.toUpperCase()) {
      return fail('INVALID_BHARAT_QR');
    }
  }

  // Look inside merchant account templates (26–51) for an embedded UPI URI or VPA.
  let vpa: string | undefined;
  for (const t of tlvs) {
    const n = Number(t.tag);
    if (n < 26 || n > 51) continue;
    const nested = parseTlv(t.value) ?? [];
    for (const sub of nested) {
      const v = sub.value.trim();
      if (v.toLowerCase().startsWith('upi://')) {
        const r = parseUpiQr(v);
        if (r.ok) return { ok: true, payload: { ...r.payload, source: 'BHARAT_QR' } };
      }
      if (!vpa && isValidVpa(v)) vpa = v;
    }
  }
  if (!vpa) return fail('MISSING_PAYEE_ADDRESS');

  const get = (tag: string) => tlvs.find((t) => t.tag === tag)?.value;
  const params: Record<string, string> = { pa: vpa };
  const name = get('59');
  if (name) params.pn = name;
  const amount = get('54');
  if (amount) params.am = amount;
  const currency = get('53');
  if (currency) params.cu = currency === '356' ? 'INR' : currency;
  const mcc = get('52');
  if (mcc) params.mc = mcc;
  const additional = get('62');
  if (additional) {
    const ref = parseTlv(additional)?.find((t) => t.tag === '05')?.value;
    if (ref) params.tr = ref;
  }
  return fromParams(params, 'BHARAT_QR');
}

/* ----------------------------- Intent builder ---------------------------- */

/** Parameters PayTrack re-emits verbatim from the QR (merchant/signature fields). */
const PASSTHROUGH_KEYS = ['mc', 'tr', 'tid', 'url', 'mode', 'purpose', 'orgid', 'sign', 'mid', 'msid', 'mtid', 'qrmedium', 'invoiceno', 'invoicedate', 'gstin', 'gstbrkup'];

export interface BuildIntentOptions {
  amountPaise: number;
  /** Optional note to include as `tn` when QR has none. */
  note?: string;
}

export class UpiIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpiIntentError';
  }
}

/**
 * Builds a `upi://pay` URI from a parsed QR and a confirmed amount.
 * Never silently changes a locked/signed amount.
 */
export function buildUpiPaymentUri(payload: UpiPayload, opts: BuildIntentOptions): string {
  const { amountPaise } = opts;
  if (!Number.isInteger(amountPaise) || amountPaise <= 0 || amountPaise > MAX_AMOUNT_PAISE) {
    throw new UpiIntentError('Amount is invalid');
  }
  if (payload.amountLocked && payload.amountPaise != null && payload.amountPaise !== amountPaise) {
    throw new UpiIntentError('This QR has a fixed amount that cannot be changed');
  }
  if (payload.minAmountPaise != null && amountPaise < payload.minAmountPaise) {
    throw new UpiIntentError('Amount is below the minimum requested by this QR');
  }
  if (!isValidVpa(payload.pa)) throw new UpiIntentError('UPI ID is invalid');

  const pairs: [string, string][] = [['pa', payload.pa]];
  if (payload.pn) pairs.push(['pn', payload.pn]);
  for (const k of PASSTHROUGH_KEYS) {
    const v = payload.params[k];
    if (v != null && v !== '') pairs.push([k, v]);
  }
  pairs.push(['am', paiseToDecimalString(amountPaise)]);
  if (payload.minAmountPaise != null) pairs.push(['mam', paiseToDecimalString(payload.minAmountPaise)]);
  pairs.push(['cu', 'INR']);
  const tn = payload.note ?? sanitizeText(opts.note, 50);
  if (tn) pairs.push(['tn', tn]);

  return 'upi://pay?' + pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/* ------------------------- UPI app response parser ----------------------- */

export interface UpiAppResponse {
  status: 'SUCCESS' | 'FAILURE' | 'SUBMITTED' | 'UNKNOWN';
  txnId?: string;
  txnRef?: string;
  approvalRefNo?: string;
  responseCode?: string;
  raw: string;
}

/**
 * Parses the optional `response` string some UPI apps return to the calling
 * activity (e.g. "txnId=...&responseCode=00&Status=SUCCESS&ApprovalRefNo=...").
 * This is a HINT only — PayTrack still asks the user to confirm.
 */
export function parseUpiAppResponse(raw: string | null | undefined): UpiAppResponse | null {
  if (!raw || typeof raw !== 'string') return null;
  const p = parseQuery(raw);
  if (Object.keys(p).length === 0) return null;
  const s = (p.status ?? '').toUpperCase();
  const status: UpiAppResponse['status'] =
    s === 'SUCCESS' ? 'SUCCESS' : s === 'FAILURE' || s === 'FAILED' ? 'FAILURE' : s === 'SUBMITTED' ? 'SUBMITTED' : 'UNKNOWN';
  return {
    status,
    txnId: p.txnid || undefined,
    txnRef: p.txnref || undefined,
    approvalRefNo: p.approvalrefno || undefined,
    responseCode: p.responsecode || undefined,
    raw,
  };
}

/** Well-known Android UPI apps. Presence is never assumed. */
export const KNOWN_UPI_APPS: readonly { id: string; name: string; packageName: string }[] = [
  { id: 'gpay', name: 'Google Pay', packageName: 'com.google.android.apps.nbu.paisa.user' },
  { id: 'phonepe', name: 'PhonePe', packageName: 'com.phonepe.app' },
  { id: 'paytm', name: 'Paytm', packageName: 'net.one97.paytm' },
  { id: 'bhim', name: 'BHIM', packageName: 'in.org.npci.upiapp' },
  { id: 'amazonpay', name: 'Amazon Pay', packageName: 'in.amazon.mShop.android.shopping' },
  { id: 'cred', name: 'CRED', packageName: 'com.dreamplug.androidapp' },
];
