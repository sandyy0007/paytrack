-- PayTrack initial schema. Amounts are integer paise.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  email         text NOT NULL CHECK (char_length(email) <= 254),
  phone         text CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{10,15}$'),
  password_hash text NOT NULL,
  currency      char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  default_category text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 24),
  icon       text NOT NULL DEFAULT 'other',
  color      text NOT NULL DEFAULT '#9CA3AF' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX categories_user_name_uq ON categories (user_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE expenses (
  id                    uuid PRIMARY KEY,               -- client generated (idempotent sync)
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expense_code          text NOT NULL CHECK (expense_code ~ '^EXP-[0-9]{8}-[0-9]{4}$'),
  amount_paise          bigint NOT NULL CHECK (amount_paise BETWEEN 100 AND 100000000),
  currency              char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  payee_name            text CHECK (payee_name IS NULL OR char_length(payee_name) <= 100),
  upi_id                text CHECK (upi_id IS NULL OR char_length(upi_id) <= 320),
  reason                text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 120),
  category              text NOT NULL CHECK (char_length(category) BETWEEN 2 AND 24),
  status                text NOT NULL CHECK (status IN ('DRAFT','PENDING_PAYMENT','PAYMENT_APP_OPENED','USER_RETURNED',
                          'PAYMENT_CONFIRMED_BY_USER','UTR_ADDED','PAID','FAILED','CANCELLED','UNCONFIRMED')),
  payment_method        text NOT NULL DEFAULT 'UPI' CHECK (payment_method IN ('UPI','CASH','CARD','BANK_TRANSFER','OTHER')),
  utr                   text CHECK (utr IS NULL OR utr ~ '^[0-9]{12}$'),
  transaction_reference text CHECK (transaction_reference IS NULL OR transaction_reference ~ '^[A-Z0-9]{8,35}$'),
  payment_app           text CHECK (payment_app IS NULL OR char_length(payment_app) <= 80),
  qr_source             text NOT NULL DEFAULT 'NONE' CHECK (qr_source IN ('UPI_URI','BHARAT_QR','MANUAL_UPI','NONE')),
  qr_payload            jsonb,
  notes                 text CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at            timestamptz NOT NULL,
  expense_date          timestamptz NOT NULL,
  payment_initiated_at  timestamptz,
  payment_completed_at  timestamptz,
  updated_at            timestamptz NOT NULL,
  deleted_at            timestamptz,
  server_updated_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- A UPI expense can only be PAID with a reference; UPI expenses need a UPI ID.
  CONSTRAINT paid_upi_needs_reference CHECK (
    NOT (status = 'PAID' AND payment_method = 'UPI' AND utr IS NULL AND transaction_reference IS NULL)),
  CONSTRAINT upi_needs_vpa CHECK (payment_method <> 'UPI' OR upi_id IS NOT NULL)
);
CREATE INDEX expenses_user_date_idx ON expenses (user_id, expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX expenses_user_status_idx ON expenses (user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX expenses_user_sync_idx ON expenses (user_id, server_updated_at);
CREATE UNIQUE INDEX expenses_user_utr_uq ON expenses (user_id, utr) WHERE utr IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX expenses_user_txnref_uq ON expenses (user_id, transaction_reference)
  WHERE transaction_reference IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE expense_events (
  id          uuid PRIMARY KEY,                          -- client generated (idempotent)
  expense_id  uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  at          timestamptz NOT NULL,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expense_events_expense_idx ON expense_events (expense_id, at);

CREATE TABLE budgets (
  id           uuid PRIMARY KEY,                         -- client generated
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     text NOT NULL CHECK (char_length(category) BETWEEN 2 AND 24),  -- '__ALL__' = overall
  amount_paise bigint NOT NULL CHECK (amount_paise BETWEEN 100 AND 100000000),
  period       text NOT NULL CHECK (period IN ('WEEKLY','MONTHLY')),
  thresholds   integer[] NOT NULL DEFAULT '{75,90,100}',
  start_date   date,
  end_date     date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX budgets_user_cat_period_uq ON budgets (user_id, category, period) WHERE deleted_at IS NULL;

