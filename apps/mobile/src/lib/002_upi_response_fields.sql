-- SQLite Migration 002: UPI Response and Reconciliation Fields
ALTER TABLE expenses ADD COLUMN transaction_id TEXT;
ALTER TABLE expenses ADD COLUMN approval_reference TEXT;
ALTER TABLE expenses ADD COLUMN response_code TEXT;
ALTER TABLE expenses ADD COLUMN intended_amount_paise INTEGER;
ALTER TABLE expenses ADD COLUMN actual_amount_paise INTEGER;
ALTER TABLE expenses ADD COLUMN reconciliation_status TEXT;
ALTER TABLE expenses ADD COLUMN confidence_level TEXT;
ALTER TABLE expenses ADD COLUMN confidence_reasons TEXT;
ALTER TABLE expenses ADD COLUMN mode TEXT DEFAULT 'REGULAR';
ALTER TABLE expenses ADD COLUMN split_data TEXT;
ALTER TABLE expenses ADD COLUMN recovery_dismissed INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_exp_txnid ON expenses (transaction_id);

