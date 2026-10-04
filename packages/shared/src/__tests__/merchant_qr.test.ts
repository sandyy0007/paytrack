import { describe, expect, it } from 'vitest';
import {
  buildUpiPaymentUri,
  createNormalizedPaymentIntent,
  maskUpiUriForLogging,
  parseUpiQr,
} from '../upi';

describe('Merchant UPI QR Intent Preservation & Compatibility (Phase 18)', () => {
  // TEST 1: Personal QR -> PayTrack -> UPI intent
  it('TEST 1: builds valid intent for Personal P2P QR', () => {
    const raw = 'upi://pay?pa=friend@okhdfcbank&pn=Rahul%20Sharma&cu=INR';
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const uri = buildUpiPaymentUri(r.payload, { amountPaise: 50000 });
    expect(uri).toContain('pa=friend@okhdfcbank');
    expect(uri).toContain('pn=Rahul%20Sharma');
    expect(uri).toContain('am=500.00');
    expect(uri).toContain('cu=INR');
    expect(uri).not.toContain('mc=');
    expect(uri).not.toContain('orgid=');
  });

  // TEST 2: Merchant QR -> PayTrack -> UPI intent preserves merchant characteristics
  it('TEST 2: builds valid intent for Merchant QR with acquiring bank parameters', () => {
    const raw = 'upi://pay?pa=kirana@icici&pn=Kirana%20Store&mc=5411&mode=01&orgid=159001';
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.payload.isMerchant).toBe(true);
    const uri = buildUpiPaymentUri(r.payload, { amountPaise: 12000 });
    expect(uri).toContain('pa=kirana@icici');
    expect(uri).toContain('pn=Kirana%20Store');
    expect(uri).toContain('mc=5411');
    expect(uri).toContain('mode=01');
    expect(uri).toContain('orgid=159001');
    expect(uri).toContain('am=120.00');
    expect(uri).toContain('cu=INR');
  });

  // TEST 3: Merchant QR with mc
  it('TEST 3: preserves merchant category code (mc)', () => {
    const raw = 'upi://pay?pa=restaurant@axisbank&pn=Food%20Hub&mc=5812';
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const uri = buildUpiPaymentUri(r.payload, { amountPaise: 35000 });
    expect(uri).toContain('mc=5812');
  });

  // TEST 4: Merchant QR with tr (transaction reference)
  it('TEST 4: preserves original transaction reference (tr) without overwriting', () => {
    const raw = 'upi://pay?pa=vendor@paytm&pn=Vendor&mc=5499&tr=INV987654321';
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const uri = buildUpiPaymentUri(r.payload, { amountPaise: 4500 });
    expect(uri).toContain('tr=INV987654321');
  });

  // TEST 5: Merchant QR with tn (transaction note)
  it('TEST 5: preserves QR note or safely overrides when user provides note', () => {
    const raw = 'upi://pay?pa=store@ybl&pn=Store&mc=5311&tn=OrderInvoice123';
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // When user provides no note, QR's tn is preserved
    const uri1 = buildUpiPaymentUri(r.payload, { amountPaise: 10000 });
    expect(uri1).toContain('tn=OrderInvoice123');

    // When user provides a custom note, sanitized note is used
    const uri2 = buildUpiPaymentUri(r.payload, { amountPaise: 10000, note: 'Groceries' });
    expect(uri2).toContain('tn=Groceries');
  });

  // TEST 6: QR with fixed amount (am locked)
  it('TEST 6: preserves locked fixed amount exactly from QR', () => {
    const raw = 'upi://pay?pa=merchant@hdfcbank&pn=Retailer&mc=5411&am=299.00&sign=xyz';
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.payload.amountLocked).toBe(true);
    expect(r.payload.amountPaise).toBe(29900);
    const uri = buildUpiPaymentUri(r.payload, { amountPaise: 29900 });
    expect(uri).toContain('am=299.00');
  });

  // TEST 7: QR without amount -> PayTrack enters intended amount
  it('TEST 7: QR without amount correctly injects user intended amount', () => {
    const raw = 'upi://pay?pa=counter@sbi&pn=Coffee%20Shop&mc=5814';
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.payload.amountPaise).toBeUndefined();
    expect(r.payload.amountLocked).toBe(false);

    // Intended: ₹85.50
    const uri = buildUpiPaymentUri(r.payload, { amountPaise: 8550 });
    expect(uri).toContain('am=85.50');
    expect(uri).toContain('cu=INR');
  });

  // TEST 8: Merchant QR with mode (01, 02) and orgid preserved
  it('TEST 8: preserves mode=01 and orgid for static merchant stands', () => {
    const raw = 'upi://pay?pa=phonepe.merchant@ybl&pn=General%20Store&mc=5411&mode=01&orgid=159001';
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const uri = buildUpiPaymentUri(r.payload, { amountPaise: 25000 });
    expect(uri).toContain('mode=01');
    expect(uri).toContain('orgid=159001');
  });

  // TEST 9: Merchant QR with digital signature (sign) containing '+' characters
  it('TEST 9: preserves Base64 cryptographic signature without corrupting + into space', () => {
    const signature = 'MEYCIQD+abc123/xyz+def==';
    const raw = `upi://pay?pa=soundbox@paytm&pn=Soundbox%20Shop&mc=5411&mode=02&orgid=180001&sign=${encodeURIComponent(signature)}`;
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.payload.sign).toBe(signature);
    expect(r.payload.sign).toContain('+');

    const uri = buildUpiPaymentUri(r.payload, { amountPaise: 1000 });
    // When re-encoded into URI, + should be safely percent-encoded as %2B
    expect(uri).toContain('sign=MEYCIQD%2Babc123%2Fxyz%2Bdef%3D%3D');
  });

  // TEST 10: Merchant QR containing additional parameters
  it('TEST 10: preserves all merchant metadata (tid, mid, msid, mtid, url, custom keys)', () => {
    const raw = 'upi://pay?pa=superstore@icici&pn=Super%20Store&mc=5411&tid=T1001&mid=M999&msid=S888&mtid=TERM1&url=https%3A%2F%2Fstore.in%2Fbill&customTag=XYZ123';
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const uri = buildUpiPaymentUri(r.payload, { amountPaise: 9900 });
    expect(uri).toContain('tid=T1001');
    expect(uri).toContain('mid=M999');
    expect(uri).toContain('msid=S888');
    expect(uri).toContain('mtid=TERM1');
    expect(uri).toContain('url=https%3A%2F%2Fstore.in%2Fbill');
    expect(uri).toContain('customtag=XYZ123');
  });

  // Normalized Payment Intent Object
  it('creates normalized payment intent object correctly', () => {
    const raw = 'upi://pay?pa=merchant@axis&pn=Stationery&mc=5943&mode=01&orgid=159001&tr=REF100';
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const intent = createNormalizedPaymentIntent(r.payload, { amountPaise: 15000, note: 'Books' });
    expect(intent.pa).toBe('merchant@axis');
    expect(intent.pn).toBe('Stationery');
    expect(intent.amount).toBe('150.00');
    expect(intent.currency).toBe('INR');
    expect(intent.merchantCategoryCode).toBe('5943');
    expect(intent.mode).toBe('01');
    expect(intent.organizationId).toBe('159001');
    expect(intent.transactionReference).toBe('REF100');
    expect(intent.note).toBe('Books');
    expect(intent.originalQrPayload).toBe(raw);
  });

  // Logging mask helper
  it('correctly masks sensitive identifiers for safe development logging', () => {
    const uri = 'upi://pay?pa=sandeep.kumar@okhdfcbank&pn=Sandeep&mc=5411&mode=01&tr=TXN123456&sign=MEYCIQD123456789&am=100.00&cu=INR';
    const masked = maskUpiUriForLogging(uri);
    expect(masked).not.toContain('sandeep.kumar@okhdfcbank');
    expect(masked).toContain('pa=s***r@okhdfcbank');
    expect(masked).toContain('mc=5411');
    expect(masked).toContain('mode=01');
    expect(masked).toContain('am=100.00');
    expect(masked).toContain('tr=TX***56');
    expect(masked).toContain('sign=MEYCIQ***');
  });
});
