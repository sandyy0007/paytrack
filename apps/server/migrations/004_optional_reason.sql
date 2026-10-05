-- PayTrack migration 004: Allow optional/empty reason on expenses table
ALTER TABLE expenses ALTER COLUMN reason DROP NOT NULL;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_reason_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_reason_check CHECK (reason IS NULL OR char_length(reason) <= 120);
