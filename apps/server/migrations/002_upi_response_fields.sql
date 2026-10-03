-- Migration 002: UPI response fields and reconciliation support
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_reference text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS response_code text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS original_qr_payload_hash text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_intent_hash text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS intended_amount_paise bigint;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS actual_amount_paise bigint;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reconciliation_status text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS confidence_level text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS confidence_reasons text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS mode text DEFAULT 'Personal';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS split_data jsonb;
