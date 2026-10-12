import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createPool } from '../src/db';
import { migrate } from '../src/migrate';

process.env.BCRYPT_ROUNDS = '4';
const db = createPool(process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/paytrack_test');
const app = createApp(db, { rateLimit: false });

beforeAll(async () => {
  const currentDbName = (await db.query<{ current_database: string }>('SELECT current_database()')).rows[0]?.current_database;
  if (!currentDbName || !currentDbName.endsWith('_test')) {
    throw new Error(`SAFETY ERROR: Refusing to drop schema on non-test database: "${currentDbName}". Database name must end with "_test".`);
  }
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
});
afterAll(() => db.end());

async function register(email = `u${randomUUID().slice(0, 8)}@test.dev`) {
  const res = await request(app).post('/auth/register').send({ name: 'Test User', email, password: 'correct-horse' });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, refresh: res.body.refreshToken as string, email, user: res.body.user };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const now = () => new Date().toISOString();

function newExpense(over: Record<string, unknown> = {}) {
  return {
    id: randomUUID(), expenseCode: 'EXP-20260927-0017', amountPaise: 85000, payeeName: 'Rahul Sharma', upiId: 'rahul@upi',
    reason: 'Project Components', category: 'Education', paymentMethod: 'UPI', qrSource: 'UPI_URI',
    qrPayload: { pa: 'rahul@upi', pn: 'Rahul Sharma' }, createdAt: now(), ...over,
  };
}

async function toStatus(token: string, id: string, to: string, extra: Record<string, unknown> = {}) {
  return request(app).post(`/expenses/${id}/status`).set(auth(token)).send({ to, at: now(), eventId: randomUUID(), ...extra });
}

describe('auth', () => {
  it('registers, logs in, rejects bad password, rotates refresh tokens with reuse detection', async () => {
    const u = await register();
    expect(u.user.email).toBe(u.email);
    expect((await request(app).post('/auth/register').send({ name: 'X', email: u.email.toUpperCase(), password: 'another-pass' })).body.error.code).toBe('EMAIL_TAKEN');
    expect((await request(app).post('/auth/login').send({ email: u.email, password: 'wrong-password' })).status).toBe(401);
    const login = await request(app).post('/auth/login').send({ email: u.email, password: 'correct-horse' });
    expect(login.status).toBe(200);

    const r1 = await request(app).post('/auth/refresh').send({ refreshToken: u.refresh });
    expect(r1.status).toBe(200);
    // reusing the old token is refused and revokes the family
    expect((await request(app).post('/auth/refresh').send({ refreshToken: u.refresh })).status).toBe(401);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: r1.body.refreshToken })).status).toBe(401);
  });

  it('requires auth and validates input', async () => {
    expect((await request(app).get('/expenses')).status).toBe(401);
    expect((await request(app).get('/expenses').set(auth('garbage'))).status).toBe(401);
    const bad = await request(app).post('/auth/register').send({ name: '', email: 'nope', password: 'short' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('payment-linked expense flow', () => {
  it('runs slip → UPI app → return → confirm → UTR → PAID with a full timeline', async () => {
    const { token } = await register();
    const body = newExpense();
    const created = await request(app).post('/expenses').set(auth(token)).send(body);
    expect(created.status).toBe(201);
    expect(created.body.expense.status).toBe('DRAFT');
    // idempotent retry
    expect((await request(app).post('/expenses').set(auth(token)).send(body)).status).toBe(200);

    expect((await toStatus(token, body.id, 'PENDING_PAYMENT')).body.expense.status).toBe('PENDING_PAYMENT');

    // cannot jump to PAID
    const illegal = await toStatus(token, body.id, 'PAID');
    expect(illegal.status).toBe(409);
    expect(illegal.body.error.code).toBe('ILLEGAL_TRANSITION');

    const init = await request(app).post(`/expenses/${body.id}/payment-initiate`).set(auth(token)).send({ paymentApp: 'Google Pay' });
    expect(init.body.expense.status).toBe('PAYMENT_APP_OPENED');
    expect(init.body.expense.paymentInitiatedAt).toBeTruthy();

    // still cannot mark paid just because the app opened
    expect((await request(app).post(`/expenses/${body.id}/utr`).set(auth(token)).send({ reference: '627012345678' })).status).toBe(409);

    await toStatus(token, body.id, 'USER_RETURNED');
    await toStatus(token, body.id, 'PAYMENT_CONFIRMED_BY_USER');

    const badUtr = await request(app).post(`/expenses/${body.id}/utr`).set(auth(token)).send({ reference: '12345' });
    expect(badUtr.status).toBe(409);
    expect(badUtr.body.error.code).toBe('REFERENCE_REQUIRED');

    const paid = await request(app).post(`/expenses/${body.id}/utr`).set(auth(token)).send({ reference: '6270 1234 5678' });
    expect(paid.status).toBe(200);
    expect(paid.body.expense).toMatchObject({ status: 'PAID', utr: '627012345678', paymentApp: 'Google Pay' });

    const detail = await request(app).get(`/expenses/${body.id}`).set(auth(token));
    expect(detail.body.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      'DRAFT', 'PENDING_PAYMENT', 'PAYMENT_APP_OPENED', 'USER_RETURNED', 'PAYMENT_CONFIRMED_BY_USER', 'UTR_ADDED', 'PAID',
    ]);

    // PAID is terminal
    expect((await toStatus(token, body.id, 'FAILED')).status).toBe(409);
  });

  it('rejects duplicate UTR per user but allows the same UTR for another user', async () => {
    const a = await register();
    const b = await register();
    const setup = async (token: string) => {
      const e = newExpense();
      await request(app).post('/expenses').set(auth(token)).send(e);
      for (const s of ['PENDING_PAYMENT', 'PAYMENT_APP_OPENED', 'USER_RETURNED', 'PAYMENT_CONFIRMED_BY_USER']) await toStatus(token, e.id, s);
      return e.id;
    };
    const e1 = await setup(a.token);
    const e2 = await setup(a.token);
    expect((await request(app).post(`/expenses/${e1}/utr`).set(auth(a.token)).send({ reference: '611112222333' })).status).toBe(200);
    const dup = await request(app).post(`/expenses/${e2}/utr`).set(auth(a.token)).send({ reference: '611112222333' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'DUPLICATE_REFERENCE', message: 'Transaction ID already exists.' });
    // e2 must be left untouched (tx rolled back)
    expect((await request(app).get(`/expenses/${e2}`).set(auth(a.token))).body.expense.status).toBe('PAYMENT_CONFIRMED_BY_USER');
    const e3 = await setup(b.token);
    expect((await request(app).post(`/expenses/${e3}/utr`).set(auth(b.token)).send({ reference: '611112222333' })).status).toBe(200);
  });

  it('supports failure, retry, cancel and unconfirmed paths', async () => {
    const { token } = await register();
    const e = newExpense();
    await request(app).post('/expenses').set(auth(token)).send(e);
    await toStatus(token, e.id, 'PENDING_PAYMENT');
    await toStatus(token, e.id, 'PAYMENT_APP_OPENED');
    await toStatus(token, e.id, 'USER_RETURNED');
    expect((await toStatus(token, e.id, 'FAILED')).body.expense.status).toBe('FAILED');
    expect((await toStatus(token, e.id, 'PAYMENT_APP_OPENED')).body.expense.status).toBe('PAYMENT_APP_OPENED');
    expect((await toStatus(token, e.id, 'UNCONFIRMED')).body.expense.status).toBe('UNCONFIRMED');
    expect((await toStatus(token, e.id, 'CANCELLED')).body.expense.status).toBe('CANCELLED');
  });

  it('records manual cash expense via DRAFT→PAID but refuses it for UPI', async () => {
    const { token } = await register();
    const cash = newExpense({ paymentMethod: 'CASH', upiId: null, payeeName: 'Tea stall', qrSource: 'NONE', qrPayload: null });
    await request(app).post('/expenses').set(auth(token)).send(cash);
    expect((await toStatus(token, cash.id, 'PAID')).body.expense.status).toBe('PAID');
    const upi = newExpense();
    await request(app).post('/expenses').set(auth(token)).send(upi);
    expect((await toStatus(token, upi.id, 'PAID')).body.error.code).toBe('MANUAL_ONLY');
  });

  it('validates amounts, UPI ids and future timestamps', async () => {
    const { token } = await register();
    for (const over of [{ amountPaise: 0 }, { amountPaise: 10.5 }, { amountPaise: 1e12 }, { upiId: 'bad' },
      { createdAt: new Date(Date.now() + 3600_000).toISOString() }, { currency: 'USD' }, { extra: 'x' }]) {
      const r = await request(app).post('/expenses').set(auth(token)).send(newExpense(over));
      expect(r.status, JSON.stringify(over)).toBe(400);
    }
  });

  it('locks amount/payee after slip, allows editing reason/category', async () => {
    const { token } = await register();
    const e = newExpense();
    await request(app).post('/expenses').set(auth(token)).send(e);
    await toStatus(token, e.id, 'PENDING_PAYMENT');
    expect((await request(app).patch(`/expenses/${e.id}`).set(auth(token)).send({ amountPaise: 100 })).body.error.code).toBe('FIELD_LOCKED');
    const ok = await request(app).patch(`/expenses/${e.id}`).set(auth(token)).send({ reason: 'Arduino parts', category: 'Business', notes: null });
    expect(ok.body.expense).toMatchObject({ reason: 'Arduino parts', category: 'Business', amountPaise: 85000 });
  });

  it('isolates users from each other', async () => {
    const a = await register();
    const b = await register();
    const e = newExpense();
    await request(app).post('/expenses').set(auth(a.token)).send(e);
    expect((await request(app).get(`/expenses/${e.id}`).set(auth(b.token))).status).toBe(404);
    expect((await toStatus(b.token, e.id, 'PENDING_PAYMENT')).status).toBe(404);
    expect((await request(app).delete(`/expenses/${e.id}`).set(auth(b.token))).status).toBe(404);
    // B cannot hijack A's id by "creating" it
    expect((await request(app).post('/expenses').set(auth(b.token)).send(e)).status).toBe(409);
  });
});

describe('listing, analytics, budgets, export', () => {
  it('filters, searches and paginates', async () => {
    const { token } = await register();
    for (let i = 0; i < 25; i++) {
      const e = newExpense({ reason: i % 5 === 0 ? 'Dinner with team' : 'Groceries', amountPaise: 10000 + i * 100,
        category: i % 5 === 0 ? 'Food' : 'Shopping', createdAt: new Date(Date.now() - i * 3600_000).toISOString() });
      await request(app).post('/expenses').set(auth(token)).send(e);
    }
    const p1 = await request(app).get('/expenses?limit=10').set(auth(token));
    expect(p1.body.items).toHaveLength(10);
    const p2 = await request(app).get(`/expenses?limit=10&cursor=${p1.body.nextCursor}`).set(auth(token));
    const p3 = await request(app).get(`/expenses?limit=10&cursor=${p2.body.nextCursor}`).set(auth(token));
    expect(p3.body.items).toHaveLength(5);
    expect(p3.body.nextCursor).toBeNull();
    const ids = new Set([...p1.body.items, ...p2.body.items, ...p3.body.items].map((x: { id: string }) => x.id));
    expect(ids.size).toBe(25);

    expect((await request(app).get('/expenses?q=dinner').set(auth(token))).body.items).toHaveLength(5);
    expect((await request(app).get('/expenses?q=' + encodeURIComponent('₹101')).set(auth(token))).body.items).toHaveLength(1);
    expect((await request(app).get('/expenses?bucket=PAID').set(auth(token))).body.items).toHaveLength(0);
    expect((await request(app).get('/expenses?q=%25').set(auth(token))).body.items).toHaveLength(0);
  });

  it('computes analytics from PAID only, budgets CRUD, CSV export', async () => {
    const { token } = await register();
    const cash = newExpense({ paymentMethod: 'CASH', upiId: null, category: 'Food', amountPaise: 24000, qrSource: 'NONE', qrPayload: null });
    await request(app).post('/expenses').set(auth(token)).send(cash);
    await toStatus(token, cash.id, 'PAID');
    await request(app).post('/expenses').set(auth(token)).send(newExpense()); // draft, not counted

    const s = await request(app).get('/analytics/summary?tz=330').set(auth(token));
    expect(s.body.summary.monthPaise).toBe(24000);
    expect(s.body.summary.pendingCount).toBe(0); // DRAFT isn't "pending payment"
    expect(s.body.insights[0]).toContain('₹240 on Food');

    const bid = randomUUID();
    expect((await request(app).post('/budgets').set(auth(token)).send({ id: bid, category: 'Food', amountPaise: 800000, period: 'MONTHLY' })).status).toBe(201);
    expect((await request(app).post('/budgets').set(auth(token)).send({ id: randomUUID(), category: 'Food', amountPaise: 1000, period: 'MONTHLY' })).body.error.code).toBe('DUPLICATE_BUDGET');
    expect((await request(app).patch(`/budgets/${bid}`).set(auth(token)).send({ amountPaise: 900000 })).body.budget.amountPaise).toBe(900000);
    expect((await request(app).get('/budgets').set(auth(token))).body.budgets).toHaveLength(1);
    await request(app).delete(`/budgets/${bid}`).set(auth(token));
    expect((await request(app).get('/budgets').set(auth(token))).body.budgets).toHaveLength(0);

    const cats = await request(app).post('/categories').set(auth(token)).send({ name: 'Pets', icon: 'other', color: '#FF00AA' });
    expect(cats.status).toBe(201);
    expect((await request(app).get('/categories').set(auth(token))).body.categories.length).toBe(14);

    const csv = await request(app).post('/exports').set(auth(token)).send({ format: 'csv', tz: 330 });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\r\n')[0]).toContain('Date,Time,Amount (INR),Payee,UPI ID,Reason,Category,Status,UTR');
    expect(csv.text).toContain('240.00');
  });
});

describe('offline sync', () => {
  it('replays a queued offline journey idempotently and reports per-op errors', async () => {
    const { token } = await register();
    const draftEventId = randomUUID();
    const e = { ...newExpense(), draftEventId };
    const t = (m: number) => new Date(Date.now() - (10 - m) * 60_000).toISOString();
    const ops = [
      { opId: randomUUID(), type: 'expense.create', payload: e },
      { opId: randomUUID(), type: 'expense.transition', payload: { id: e.id, to: 'PENDING_PAYMENT', at: t(1), eventId: randomUUID() } },
      { opId: randomUUID(), type: 'expense.transition', payload: { id: e.id, to: 'PAYMENT_APP_OPENED', at: t(2), eventId: randomUUID(), paymentApp: 'PhonePe' } },
      { opId: randomUUID(), type: 'expense.transition', payload: { id: e.id, to: 'USER_RETURNED', at: t(3), eventId: randomUUID() } },
      { opId: randomUUID(), type: 'expense.transition', payload: { id: e.id, to: 'PAYMENT_CONFIRMED_BY_USER', at: t(4), eventId: randomUUID() } },
      { opId: randomUUID(), type: 'expense.reference', payload: { id: e.id, reference: '627099998888', eventId: randomUUID(), at: t(5) } },
      { opId: randomUUID(), type: 'budget.upsert', payload: { id: randomUUID(), category: '__ALL__', amountPaise: 5000000, period: 'MONTHLY' } },
      { opId: randomUUID(), type: 'category.upsert', payload: { id: randomUUID(), name: 'Pets', icon: 'other', color: '#FF00AA' } },
      { opId: randomUUID(), type: 'nonsense', payload: {} },
    ];
    const r1 = await request(app).post('/sync/push').set(auth(token)).send({ ops });
    expect(r1.body.results.slice(0, 8).every((x: { ok: boolean }) => x.ok)).toBe(true);
    expect(r1.body.results[8]).toMatchObject({ ok: false, code: 'VALIDATION_ERROR', retryable: false });

    // A retried push (e.g. response lost) is harmless.
    const r2 = await request(app).post('/sync/push').set(auth(token)).send({ ops: ops.slice(0, 8) });
    expect(r2.body.results.every((x: { ok: boolean }) => x.ok)).toBe(true);

    const pull = await request(app).get('/sync/pull').set(auth(token));
    expect(pull.body.events.filter((x: { toStatus: string }) => x.toStatus === 'DRAFT')[0].id).toBe(draftEventId);
    expect(pull.body.expenses).toHaveLength(1);
    expect(pull.body.expenses[0]).toMatchObject({ status: 'PAID', utr: '627099998888', paymentApp: 'PhonePe' });
    expect(pull.body.events).toHaveLength(7);
    expect(pull.body.budgets).toHaveLength(1);
    expect(pull.body.categories).toMatchObject([{ name: 'Pets' }]);

    const again = await request(app).get(`/sync/pull?since=${encodeURIComponent(pull.body.cursor)}`).set(auth(token));
    expect(again.body.expenses).toHaveLength(0);
  });
});

describe('account', () => {
  it('updates profile and deletes account with all data', async () => {
    const u = await register();
    const p = await request(app).patch('/me').set(auth(u.token)).send({ name: 'Winfred', phone: '+919876543210', defaultCategory: 'Food' });
    expect(p.body.user).toMatchObject({ name: 'Winfred', defaultCategory: 'Food' });
    await request(app).post('/expenses').set(auth(u.token)).send(newExpense());
    expect((await request(app).delete('/me').set(auth(u.token))).status).toBe(204);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [u.email]);
    expect(rows[0].n).toBe(0);
  });
});
