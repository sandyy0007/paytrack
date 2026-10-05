import { describe, expect, it } from 'vitest';
import { CATEGORY_NAME_RE } from '../categories';
import { buildUpiPaymentUri, type UpiPayload } from '../upi';

function validatePurposeSubmission(params: {
  category: string | null;
  reason: string;
}): { valid: boolean; error?: string; cleanReason: string; category: string } {
  const r = params.reason.trim();
  if (!params.category || !CATEGORY_NAME_RE.test(params.category)) {
    return { valid: false, error: 'Choose a category.', cleanReason: r, category: '' };
  }
  return { valid: true, cleanReason: r, category: params.category };
}

function resolveUpiNote(reason: string, shareNoteWithPayee: boolean): string | undefined {
  const trimmed = reason.trim();
  return (shareNoteWithPayee && trimmed) ? trimmed : undefined;
}

describe('Purpose Screen Validation & Slip Generation (Prompt 10)', () => {
  const samplePayload: UpiPayload = {
    pa: 'merchant@bank',
    pn: 'Test Merchant',
    source: 'UPI_URI',
    currency: 'INR',
    isMerchant: false,
    amountLocked: false,
    params: { pa: 'merchant@bank', pn: 'Test Merchant' },
  };

  it('Test 1: Food + empty reason -> should create slip', () => {
    const res = validatePurposeSubmission({ category: 'Food', reason: '' });
    expect(res.valid).toBe(true);
    expect(res.cleanReason).toBe('');
    expect(res.category).toBe('Food');
  });

  it('Test 2: Food + "Dinner" -> should create slip', () => {
    const res = validatePurposeSubmission({ category: 'Food', reason: 'Dinner' });
    expect(res.valid).toBe(true);
    expect(res.cleanReason).toBe('Dinner');
    expect(res.category).toBe('Food');
  });

  it('Test 3: Travel + empty reason -> should create slip', () => {
    const res = validatePurposeSubmission({ category: 'Travel', reason: '   ' });
    expect(res.valid).toBe(true);
    expect(res.cleanReason).toBe('');
    expect(res.category).toBe('Travel');
  });

  it('Test 4: Custom + empty reason -> should create slip if Custom category is valid', () => {
    const res = validatePurposeSubmission({ category: 'Gym & Fitness', reason: '' });
    expect(res.valid).toBe(true);
    expect(res.cleanReason).toBe('');
    expect(res.category).toBe('Gym & Fitness');
  });

  it('Test 5: Category not selected + empty reason -> should still be blocked because category is required', () => {
    const resNull = validatePurposeSubmission({ category: null, reason: '' });
    expect(resNull.valid).toBe(false);
    expect(resNull.error).toBe('Choose a category.');

    const resEmpty = validatePurposeSubmission({ category: '', reason: '' });
    expect(resEmpty.valid).toBe(false);
    expect(resEmpty.error).toBe('Choose a category.');
  });

  it('Test 6: Reason empty + "Add reason as UPI note" ON -> should NOT crash and should NOT block slip creation, note omitted', () => {
    const res = validatePurposeSubmission({ category: 'Food', reason: '' });
    expect(res.valid).toBe(true);

    const shareNoteWithPayee = true;
    const note = resolveUpiNote(res.cleanReason, shareNoteWithPayee);
    expect(note).toBeUndefined();

    const uri = buildUpiPaymentUri(samplePayload, { amountPaise: 50000, note });
    expect(uri).toBeDefined();
    expect(uri).toContain('pa=merchant@bank');
    expect(uri).not.toContain('tn=');
  });

  it('Test 6b: Reason present + "Add reason as UPI note" ON -> note safely attached to UPI URI', () => {
    const res = validatePurposeSubmission({ category: 'Food', reason: 'Dinner with friends' });
    expect(res.valid).toBe(true);

    const shareNoteWithPayee = true;
    const note = resolveUpiNote(res.cleanReason, shareNoteWithPayee);
    expect(note).toBe('Dinner with friends');

    const uri = buildUpiPaymentUri(samplePayload, { amountPaise: 50000, note });
    expect(uri).toContain('tn=Dinner%20with%20friends');
  });
});
