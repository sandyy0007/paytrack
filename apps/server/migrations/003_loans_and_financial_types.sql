-- Migration 003: Financial separation, loans, and financial types
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS financial_type text DEFAULT 'EXPENSE';

CREATE TABLE IF NOT EXISTS loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  person_name text NOT NULL,
  person_contact text,
  direction text NOT NULL CHECK (direction IN ('LENT', 'BORROWED')),
  original_amount_paise bigint NOT NULL CHECK (original_amount_paise > 0),
  repaid_amount_paise bigint NOT NULL DEFAULT 0,
  remaining_amount_paise bigint NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PARTIALLY_REPAID', 'SETTLED', 'CANCELLED')),
  due_date timestamptz,
  notes text,
  linked_transaction_id text,
  created_from_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loans_user_idx ON loans (user_id);
CREATE INDEX IF NOT EXISTS loans_direction_idx ON loans (direction);
CREATE INDEX IF NOT EXISTS loans_status_idx ON loans (status);

