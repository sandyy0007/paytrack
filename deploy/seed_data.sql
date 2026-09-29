-- PayTrack Existing Data Migration Seed
-- Preserves existing user accounts, expenses, and event history

-- Users
INSERT INTO public.users (id, name, email, phone, password_hash, currency, default_category, created_at, updated_at) 
VALUES ('84267568-9ff8-4eab-9fc7-57d82a193952', 'Sandeep', 'sk74531614@gmail.com', '7878808208', '$2b$12$SLGCAgf8w5s2FP0EbTT8MO7TvirIDbRYGRWPsV2SKMOpa88eggauG', 'INR', NULL, '2026-09-29 11:45:22.657744+05:30', '2026-09-29 11:45:22.657744+05:30')
ON CONFLICT (id) DO NOTHING;

-- Expenses
INSERT INTO public.expenses (id, user_id, expense_code, amount_paise, currency, payee_name, upi_id, reason, category, status, payment_method, utr, transaction_reference, payment_app, qr_source, qr_payload, notes, created_at, expense_date, payment_initiated_at, payment_completed_at, updated_at, deleted_at, server_updated_at) 
VALUES ('ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', 'EXP-20260929-0001', 50000, 'INR', 'ANUJ KUMAR', '6377189944-2@ybl', 'Travel', 'Travel', 'FAILED', 'UPI', NULL, NULL, 'UPI app', 'UPI_URI', '{"mc": "0000", "pa": "6377189944-2@ybl", "pn": "ANUJ KUMAR", "mode": "02", "purpose": "00"}', NULL, '2026-09-29 11:12:08.816+05:30', '2026-09-29 11:12:08.816+05:30', '2026-09-29 11:12:20.278+05:30', NULL, '2026-09-29 11:13:15.344+05:30', NULL, '2026-09-29 11:45:23.337632+05:30')
ON CONFLICT (id) DO NOTHING;

-- Expense Events
INSERT INTO public.expense_events (id, expense_id, user_id, from_status, to_status, at, meta, created_at) 
VALUES 
  ('520a78d2-fd8d-474d-a6bc-1630e0c2b186', 'ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', NULL, 'DRAFT', '2026-09-29 11:12:08.816+05:30', NULL, '2026-09-29 11:45:23.298536+05:30'),
  ('30dff110-6d27-4b35-8bfd-6e6486bbfba9', 'ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', 'DRAFT', 'PENDING_PAYMENT', '2026-09-29 11:12:08.816+05:30', NULL, '2026-09-29 11:45:23.316598+05:30'),
  ('f51effd9-51d5-4ed6-b176-4cf48dae1f4b', 'ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', 'PENDING_PAYMENT', 'PAYMENT_APP_OPENED', '2026-09-29 11:12:20.278+05:30', NULL, '2026-09-29 11:45:23.324881+05:30'),
  ('ae2d24b7-c69d-4a09-a73c-35ea4a418e60', 'ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', 'PAYMENT_APP_OPENED', 'USER_RETURNED', '2026-09-29 11:13:09.108+05:30', NULL, '2026-09-29 11:45:23.329363+05:30'),
  ('e542ac18-2e5b-4735-ab30-499e6b415658', 'ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', 'USER_RETURNED', 'FAILED', '2026-09-29 11:13:15.344+05:30', NULL, '2026-09-29 11:45:23.334206+05:30')
ON CONFLICT (id) DO NOTHING;
