import { describe, expect, it } from 'vitest';
import { buildUpiPaymentUri, crc16ccitt, parseUpiAppResponse, parseUpiQr, UpiIntentError } from '../upi';

describe('parseUpiQr – upi:// URIs', () => {
  it('parses a P2P QR with name and no amount', () => {
    const r = parseUpiQr('upi://pay?pa=rahul@upi&pn=Rahul%20Sharma&cu=INR');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.pa).toBe('rahul@upi');
    expect(r.payload.pn).toBe('Rahul Sharma');
    expect(r.payload.amountPaise).toBeUndefined();
    expect(r.payload.amountLocked).toBe(false);
    expect(r.payload.isMerchant).toBe(false);
  });

  it('parses amount, handles + as space and case-insensitive keys/scheme', () => {
    const r = parseUpiQr('UPI://pay?PA=food.corner@okaxis&PN=Food+Corner&AM=240.5&TN=Lunch');
    expect(r.ok && r.payload.amountPaise).toBe(24050);
    expect(r.ok && r.payload.pn).toBe('Food Corner');
    expect(r.ok && r.payload.note).toBe('Lunch');
  });

  it('works without payee name', () => {
    const r = parseUpiQr('upi://pay?pa=9876543210@ybl');
    expect(r.ok && r.payload.pn).toBeUndefined();
  });

  it('treats am=0 as no fixed amount', () => {
    const r = parseUpiQr('upi://pay?pa=a1@ybl&am=0.00');
    expect(r.ok && r.payload.amountPaise).toBeUndefined();
  });

  it('locks amount for merchant/signed QRs', () => {
    const r = parseUpiQr('upi://pay?pa=shop@icici&pn=Shop&mc=5411&tr=ORD123&am=499.00');
    expect(r.ok && r.payload.amountLocked).toBe(true);
    expect(r.ok && r.payload.isMerchant).toBe(true);
  });

  it.each([
    ['', 'EMPTY'],
    ['https://example.com', 'NOT_UPI'],
    ['hello world', 'NOT_UPI'],
    ['upi://mandate?pa=a@b', 'UNSUPPORTED_UPI_ACTION'],
    ['upi://pay?pn=NoId', 'MISSING_PAYEE_ADDRESS'],
    ['upi://pay?pa=not-a-vpa', 'INVALID_PAYEE_ADDRESS'],
    ['upi://pay?pa=a1@ybl&am=abc', 'INVALID_AMOUNT'],
    ['upi://pay?pa=a1@ybl&am=-5', 'INVALID_AMOUNT'],
    ['upi://pay?pa=a1@ybl&am=99999999', 'INVALID_AMOUNT'],
    ['upi://pay?pa=a1@ybl&cu=USD', 'UNSUPPORTED_CURRENCY'],
  ])('rejects %j with %s', (raw, code) => {
    const r = parseUpiQr(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(code);
  });

  it('survives malformed percent-encoding', () => {
    const r = parseUpiQr('upi://pay?pa=a1@ybl&pn=Bad%ZZName');
    expect(r.ok && r.payload.pn).toBe('Bad%ZZName');
  });

  it('strips control characters from payee name', () => {
    const r = parseUpiQr('upi://pay?pa=a1@ybl&pn=Evil%0A%0DName');
    expect(r.ok && r.payload.pn).toBe('Evil Name');
  });
});

function tlv(tag: string, value: string) {
  return tag + String(value.length).padStart(2, '0') + value;
}
function bharatQr(parts: string) {
  const body = parts + '6304';
  return body + crc16ccitt(body);
}

describe('parseUpiQr – Bharat QR (EMV)', () => {
  it('extracts VPA, name, amount from merchant template', () => {
    const qr = bharatQr(
      tlv('00', '01') + tlv('01', '12') +
      tlv('26', tlv('00', 'A000000677010111') + tlv('01', 'merchant@hdfcbank')) +
      tlv('52', '5812') + tlv('53', '356') + tlv('54', '150.00') + tlv('58', 'IN') +
      tlv('59', 'CAFE BLUE') + tlv('60', 'PUNE'),
    );
    const r = parseUpiQr(qr);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.source).toBe('BHARAT_QR');
    expect(r.payload.pa).toBe('merchant@hdfcbank');
    expect(r.payload.pn).toBe('CAFE BLUE');
    expect(r.payload.amountPaise).toBe(15000);
    expect(r.payload.amountLocked).toBe(true);
  });

  it('rejects a bad CRC', () => {
    const qr = bharatQr(tlv('00', '01') + tlv('26', tlv('01', 'm@hdfc')) + tlv('59', 'X'));
    const broken = qr.slice(0, -4) + (qr.endsWith('0000') ? '1111' : '0000');
    const r = parseUpiQr(broken);
    expect(!r.ok && r.error).toBe('INVALID_BHARAT_QR');
  });

  it('reports missing VPA', () => {
    const r = parseUpiQr(bharatQr(tlv('00', '01') + tlv('04', '4111111111111111') + tlv('59', 'CARD ONLY')));
    expect(!r.ok && r.error).toBe('MISSING_PAYEE_ADDRESS');
  });
});

describe('buildUpiPaymentUri', () => {
  const p2p = (() => {
    const r = parseUpiQr('upi://pay?pa=rahul@upi&pn=Rahul%20Sharma');
    if (!r.ok) throw new Error();
    return r.payload;
  })();

  it('builds from parsed payload + chosen amount', () => {
    expect(buildUpiPaymentUri(p2p, { amountPaise: 85000 })).toBe(
      'upi://pay?pa=rahul@upi&pn=Rahul%20Sharma&am=850.00&cu=INR',
    );
  });

  it('adds optional note only when provided', () => {
    expect(buildUpiPaymentUri(p2p, { amountPaise: 100, note: 'Project components' })).toContain('tn=Project%20components');
  });

  it('preserves merchant params and refuses changing a locked amount', () => {
    const r = parseUpiQr('upi://pay?pa=shop@icici&pn=Shop&mc=5411&tr=ORD123&am=499.00&sign=abc');
    if (!r.ok) throw new Error();
    const uri = buildUpiPaymentUri(r.payload, { amountPaise: 49900 });
    expect(uri).toContain('mc=5411');
    expect(uri).toContain('tr=ORD123');
    expect(uri).toContain('sign=abc');
    expect(() => buildUpiPaymentUri(r.payload, { amountPaise: 100 })).toThrow(UpiIntentError);
  });

  it('enforces minimum amount and validity', () => {
    const r = parseUpiQr('upi://pay?pa=a1@ybl&mam=50');
    if (!r.ok) throw new Error();
    expect(() => buildUpiPaymentUri(r.payload, { amountPaise: 1000 })).toThrow();
    expect(() => buildUpiPaymentUri(p2p, { amountPaise: 0 })).toThrow();
    expect(() => buildUpiPaymentUri(p2p, { amountPaise: 1.5 })).toThrow();
  });
});

describe('parseUpiAppResponse', () => {
  it('parses success hint and extracts 12-digit UTR', () => {
    const r = parseUpiAppResponse('txnId=AXI123&responseCode=00&Status=SUCCESS&txnRef=PT1&ApprovalRefNo=627012345678');
    expect(r?.status).toBe('SUCCESS');
    expect(r?.approvalRefNo).toBe('627012345678');
    expect(r?.utr).toBe('627012345678');
    expect(r?.txnId).toBe('AXI123');
    expect(r?.txnRef).toBe('PT1');
    expect(r?.responseCode).toBe('00');
  });

  it('does not mislabel non-12-digit approval ref as UTR', () => {
    const r = parseUpiAppResponse('txnId=TXN123&Status=SUCCESS&ApprovalRefNo=ABC456');
    expect(r?.approvalRefNo).toBe('ABC456');
    expect(r?.utr).toBeUndefined();
    expect(r?.txnId).toBe('TXN123');
  });

  it('handles empty / junk', () => {
    expect(parseUpiAppResponse('')).toBeNull();
    expect(parseUpiAppResponse(undefined)).toBeNull();
    expect(parseUpiAppResponse('Status=weird')?.status).toBe('UNKNOWN');
  });

  it('parses bundle / record object from Android Intent extra', () => {
    const r = parseUpiAppResponse({
      Status: 'SUCCESS',
      txnId: 'PTM999888',
      ApprovalRefNo: '423456789012',
      responseCode: '00',
    });
    expect(r?.status).toBe('SUCCESS');
    expect(r?.txnId).toBe('PTM999888');
    expect(r?.utr).toBe('423456789012');
  });

  it('parses response from uri string with scheme or path', () => {
    const r = parseUpiAppResponse('paytrack://upi-return?Status=SUCCESS&txnId=UPI111&ApprovalRefNo=123456789012');
    expect(r?.status).toBe('SUCCESS');
    expect(r?.txnId).toBe('UPI111');
    expect(r?.utr).toBe('123456789012');
  });

  it('preserves merchant QR mode=01, mode=02 and orgid in intent URI', () => {
    const r = parseUpiQr('upi://pay?pa=paytmqr6ohg0f@ptyes&pn=PRADEEP%20KUSHWAH&mc=5499&mode=02&orgid=000000');
    if (!r.ok) throw new Error();
    const uri = buildUpiPaymentUri(r.payload, { amountPaise: 2000 });
    expect(uri).toContain('pa=paytmqr6ohg0f@ptyes');
    expect(uri).toContain('pn=PRADEEP%20KUSHWAH');
    expect(uri).toContain('mc=5499');
    expect(uri).toContain('mode=02');
    expect(uri).toContain('orgid=000000');
    expect(uri).toContain('am=20.00');
  });
});
