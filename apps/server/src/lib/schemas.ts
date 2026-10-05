import {
  CATEGORY_NAME_RE, EXPENSE_STATUSES, MAX_AMOUNT_PAISE, MIN_AMOUNT_PAISE, NOTES_MAX, PAYMENT_METHODS, REASON_MAX, VPA_RE,
} from '@paytrack/shared';
import { z } from 'zod';

const MIN_DATE = Date.parse('2020-01-01T00:00:00Z');
/** ISO timestamp not in the far past and not more than 10 min in the future (client clock skew). */
export const isoTime = z
  .string()
  .datetime({ offset: true })
  .refine((s) => {
    const t = Date.parse(s);
    return t >= MIN_DATE && t <= Date.now() + 10 * 60_000;
  }, 'Timestamp out of range');

export const uuid = z.string().uuid();
export const amountPaise = z.number().int().min(MIN_AMOUNT_PAISE).max(MAX_AMOUNT_PAISE);
export const categoryName = z.string().trim().regex(CATEGORY_NAME_RE, 'Invalid category name');
const text = (max: number) => z.string().trim().min(1).max(max);

export const expenseCreate = z
  .object({
    id: uuid,
    /** Client id of the initial DRAFT timeline event, so both sides share one timeline. */
    draftEventId: uuid.optional(),
    expenseCode: z.string().regex(/^EXP-\d{8}-\d{4}$/),
    amountPaise,
    currency: z.literal('INR').default('INR'),
    payeeName: z.string().trim().max(100).nullable().optional(),
    upiId: z.string().trim().regex(VPA_RE, 'Invalid UPI ID').nullable().optional(),
    reason: z.string().trim().max(REASON_MAX).default(''),
    category: categoryName,
    paymentMethod: z.enum(PAYMENT_METHODS).default('UPI'),
    qrSource: z.enum(['UPI_URI', 'BHARAT_QR', 'MANUAL_UPI', 'NONE']).default('NONE'),
    qrPayload: z.record(z.string(), z.string().max(512)).nullable().optional(),
    notes: z.string().trim().max(NOTES_MAX).nullable().optional(),
    createdAt: isoTime,
    expenseDate: isoTime.optional(),
    updatedAt: isoTime.optional(),
  })
  .strict()
  .refine((v) => v.paymentMethod !== 'UPI' || !!v.upiId, { message: 'UPI ID is required for UPI payments', path: ['upiId'] });

/** Only descriptive fields are editable; money/payee are frozen once the payment is prepared. */
export const expensePatch = z
  .object({
    reason: z.string().trim().max(REASON_MAX).optional(),
    category: categoryName.optional(),
    notes: z.string().trim().max(NOTES_MAX).nullable().optional(),
    expenseDate: isoTime.optional(),
    amountPaise: amountPaise.optional(),
    payeeName: z.string().trim().max(100).nullable().optional(),
    updatedAt: isoTime.optional(),
  })
  .strict();

export const transitionBody = z
  .object({
    to: z.enum(EXPENSE_STATUSES),
    at: isoTime.optional(),
    eventId: uuid.optional(),
    reference: z.string().max(64).optional(),
    paymentApp: z.string().trim().max(80).optional(),
    meta: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
  })
  .strict();

export const budgetBody = z
  .object({
    id: uuid,
    category: z.union([z.literal('__ALL__'), categoryName]),
    amountPaise,
    period: z.enum(['WEEKLY', 'MONTHLY']),
    thresholds: z.array(z.number().int().min(1).max(200)).min(1).max(5).default([75, 90, 100]),
  })
  .strict();

export const categoryBody = z
  .object({
    id: uuid.optional(),
    name: categoryName,
    icon: z.string().regex(/^[a-z-]{2,24}$/).default('other'),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#9CA3AF'),
  })
  .strict();

export const listQuery = z.object({
  bucket: z.enum(['ALL', 'PAID', 'PENDING', 'FAILED', 'UNCONFIRMED', 'CANCELLED']).default('ALL'),
  from: isoTime.optional(),
  to: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().max(64).optional(),
  category: z.string().max(24).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(200).optional(),
});

export const tzQuery = z.object({ tz: z.coerce.number().int().min(-720).max(840).default(330) });
