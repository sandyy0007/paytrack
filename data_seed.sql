--
-- PostgreSQL database dump
--

\restrict TSBYAUB0i56fb9Ncv4EdouT6bWSzIdtpyPlDGxKEXLUS8KSrpmT81ZngzPdt4zR

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.users (id, name, email, phone, password_hash, currency, default_category, created_at, updated_at) VALUES ('84267568-9ff8-4eab-9fc7-57d82a193952', 'Sandeep', 'sk74531614@gmail.com', '7878808208', '$2b$12$SLGCAgf8w5s2FP0EbTT8MO7TvirIDbRYGRWPsV2SKMOpa88eggauG', 'INR', NULL, '2026-09-29 11:45:22.657744+05:30', '2026-09-29 11:45:22.657744+05:30');


--
-- Data for Name: budgets; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.expenses (id, user_id, expense_code, amount_paise, currency, payee_name, upi_id, reason, category, status, payment_method, utr, transaction_reference, payment_app, qr_source, qr_payload, notes, created_at, expense_date, payment_initiated_at, payment_completed_at, updated_at, deleted_at, server_updated_at) VALUES ('ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', 'EXP-20260929-0001', 50000, 'INR', 'ANUJ KUMAR', '6377189944-2@ybl', 'Travel', 'Travel', 'FAILED', 'UPI', NULL, NULL, 'UPI app', 'UPI_URI', '{"mc": "0000", "pa": "6377189944-2@ybl", "pn": "ANUJ KUMAR", "mode": "02", "purpose": "00"}', NULL, '2026-09-29 11:12:08.816+05:30', '2026-09-29 11:12:08.816+05:30', '2026-09-29 11:12:20.278+05:30', NULL, '2026-09-29 11:13:15.344+05:30', NULL, '2026-09-29 11:45:23.337632+05:30');


--
-- Data for Name: expense_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.expense_events (id, expense_id, user_id, from_status, to_status, at, meta, created_at) VALUES ('520a78d2-fd8d-474d-a6bc-1630e0c2b186', 'ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', NULL, 'DRAFT', '2026-09-29 11:12:08.816+05:30', NULL, '2026-09-29 11:45:23.298536+05:30');
INSERT INTO public.expense_events (id, expense_id, user_id, from_status, to_status, at, meta, created_at) VALUES ('30dff110-6d27-4b35-8bfd-6e6486bbfba9', 'ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', 'DRAFT', 'PENDING_PAYMENT', '2026-09-29 11:12:08.816+05:30', NULL, '2026-09-29 11:45:23.316598+05:30');
INSERT INTO public.expense_events (id, expense_id, user_id, from_status, to_status, at, meta, created_at) VALUES ('f51effd9-51d5-4ed6-b176-4cf48dae1f4b', 'ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', 'PENDING_PAYMENT', 'PAYMENT_APP_OPENED', '2026-09-29 11:12:20.278+05:30', NULL, '2026-09-29 11:45:23.324881+05:30');
INSERT INTO public.expense_events (id, expense_id, user_id, from_status, to_status, at, meta, created_at) VALUES ('ae2d24b7-c69d-4a09-a73c-35ea4a418e60', 'ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', 'PAYMENT_APP_OPENED', 'USER_RETURNED', '2026-09-29 11:13:09.108+05:30', NULL, '2026-09-29 11:45:23.329363+05:30');
INSERT INTO public.expense_events (id, expense_id, user_id, from_status, to_status, at, meta, created_at) VALUES ('e542ac18-2e5b-4735-ab30-499e6b415658', 'ec2e24ee-57b3-4232-980e-b34ffedfedac', '84267568-9ff8-4eab-9fc7-57d82a193952', 'USER_RETURNED', 'FAILED', '2026-09-29 11:13:15.344+05:30', NULL, '2026-09-29 11:45:23.334206+05:30');


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES ('c46eb612-abb6-4d47-a0a2-56dd6c9fa616', '84267568-9ff8-4eab-9fc7-57d82a193952', 'aacdd166c45436c6e4acf9b67027e8899e542c45ac8b3bcf779cc40d3007c945', '2026-10-29 11:45:22.661981+05:30', '2026-09-29 11:46:36.26768+05:30', '2026-09-29 11:45:22.661981+05:30');


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.schema_migrations (version, applied_at) VALUES ('001_init.sql', '2026-09-27 10:53:00.752379+05:30');


--
-- PostgreSQL database dump complete
--

\unrestrict TSBYAUB0i56fb9Ncv4EdouT6bWSzIdtpyPlDGxKEXLUS8KSrpmT81ZngzPdt4zR

