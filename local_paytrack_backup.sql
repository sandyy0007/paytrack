--
-- PostgreSQL database dump
--

\restrict ioxnL2RgNBhXX8JRlKjYH5w1gTxvv72l5I66d9uvD0FYQQ7nKuiNAGClmGe6GfQ

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

ALTER TABLE IF EXISTS ONLY public.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.expenses DROP CONSTRAINT IF EXISTS expenses_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.expense_events DROP CONSTRAINT IF EXISTS expense_events_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.expense_events DROP CONSTRAINT IF EXISTS expense_events_expense_id_fkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.budgets DROP CONSTRAINT IF EXISTS budgets_user_id_fkey;
DROP INDEX IF EXISTS public.users_email_lower_uq;
DROP INDEX IF EXISTS public.refresh_tokens_user_idx;
DROP INDEX IF EXISTS public.expenses_user_utr_uq;
DROP INDEX IF EXISTS public.expenses_user_txnref_uq;
DROP INDEX IF EXISTS public.expenses_user_sync_idx;
DROP INDEX IF EXISTS public.expenses_user_status_idx;
DROP INDEX IF EXISTS public.expenses_user_date_idx;
DROP INDEX IF EXISTS public.expense_events_expense_idx;
DROP INDEX IF EXISTS public.categories_user_name_uq;
DROP INDEX IF EXISTS public.budgets_user_cat_period_uq;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.schema_migrations DROP CONSTRAINT IF EXISTS schema_migrations_pkey;
ALTER TABLE IF EXISTS ONLY public.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_token_hash_key;
ALTER TABLE IF EXISTS ONLY public.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.expenses DROP CONSTRAINT IF EXISTS expenses_pkey;
ALTER TABLE IF EXISTS ONLY public.expense_events DROP CONSTRAINT IF EXISTS expense_events_pkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_pkey;
ALTER TABLE IF EXISTS ONLY public.budgets DROP CONSTRAINT IF EXISTS budgets_pkey;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.schema_migrations;
DROP TABLE IF EXISTS public.refresh_tokens;
DROP TABLE IF EXISTS public.expenses;
DROP TABLE IF EXISTS public.expense_events;
DROP TABLE IF EXISTS public.categories;
DROP TABLE IF EXISTS public.budgets;
DROP EXTENSION IF EXISTS pgcrypto;
--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: budgets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.budgets (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    category text NOT NULL,
    amount_paise bigint NOT NULL,
    period text NOT NULL,
    thresholds integer[] DEFAULT '{75,90,100}'::integer[] NOT NULL,
    start_date date,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    server_updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT budgets_amount_paise_check CHECK (((amount_paise >= 100) AND (amount_paise <= 100000000))),
    CONSTRAINT budgets_category_check CHECK (((char_length(category) >= 2) AND (char_length(category) <= 24))),
    CONSTRAINT budgets_check CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT budgets_period_check CHECK ((period = ANY (ARRAY['WEEKLY'::text, 'MONTHLY'::text])))
);


ALTER TABLE public.budgets OWNER TO postgres;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    icon text DEFAULT 'other'::text NOT NULL,
    color text DEFAULT '#9CA3AF'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT categories_color_check CHECK ((color ~ '^#[0-9A-Fa-f]{6}$'::text)),
    CONSTRAINT categories_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 24)))
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: expense_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expense_events (
    id uuid NOT NULL,
    expense_id uuid NOT NULL,
    user_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    at timestamp with time zone NOT NULL,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.expense_events OWNER TO postgres;

--
-- Name: expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expenses (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    expense_code text NOT NULL,
    amount_paise bigint NOT NULL,
    currency character(3) DEFAULT 'INR'::bpchar NOT NULL,
    payee_name text,
    upi_id text,
    reason text NOT NULL,
    category text NOT NULL,
    status text NOT NULL,
    payment_method text DEFAULT 'UPI'::text NOT NULL,
    utr text,
    transaction_reference text,
    payment_app text,
    qr_source text DEFAULT 'NONE'::text NOT NULL,
    qr_payload jsonb,
    notes text,
    created_at timestamp with time zone NOT NULL,
    expense_date timestamp with time zone NOT NULL,
    payment_initiated_at timestamp with time zone,
    payment_completed_at timestamp with time zone,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    server_updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT expenses_amount_paise_check CHECK (((amount_paise >= 100) AND (amount_paise <= 100000000))),
    CONSTRAINT expenses_category_check CHECK (((char_length(category) >= 2) AND (char_length(category) <= 24))),
    CONSTRAINT expenses_currency_check CHECK ((currency = 'INR'::bpchar)),
    CONSTRAINT expenses_expense_code_check CHECK ((expense_code ~ '^EXP-[0-9]{8}-[0-9]{4}$'::text)),
    CONSTRAINT expenses_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 500))),
    CONSTRAINT expenses_payee_name_check CHECK (((payee_name IS NULL) OR (char_length(payee_name) <= 100))),
    CONSTRAINT expenses_payment_app_check CHECK (((payment_app IS NULL) OR (char_length(payment_app) <= 80))),
    CONSTRAINT expenses_payment_method_check CHECK ((payment_method = ANY (ARRAY['UPI'::text, 'CASH'::text, 'CARD'::text, 'BANK_TRANSFER'::text, 'OTHER'::text]))),
    CONSTRAINT expenses_qr_source_check CHECK ((qr_source = ANY (ARRAY['UPI_URI'::text, 'BHARAT_QR'::text, 'MANUAL_UPI'::text, 'NONE'::text]))),
    CONSTRAINT expenses_reason_check CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 120))),
    CONSTRAINT expenses_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PENDING_PAYMENT'::text, 'PAYMENT_APP_OPENED'::text, 'USER_RETURNED'::text, 'PAYMENT_CONFIRMED_BY_USER'::text, 'UTR_ADDED'::text, 'PAID'::text, 'FAILED'::text, 'CANCELLED'::text, 'UNCONFIRMED'::text]))),
    CONSTRAINT expenses_transaction_reference_check CHECK (((transaction_reference IS NULL) OR (transaction_reference ~ '^[A-Z0-9]{8,35}$'::text))),
    CONSTRAINT expenses_upi_id_check CHECK (((upi_id IS NULL) OR (char_length(upi_id) <= 320))),
    CONSTRAINT expenses_utr_check CHECK (((utr IS NULL) OR (utr ~ '^[0-9]{12}$'::text))),
    CONSTRAINT paid_upi_needs_reference CHECK ((NOT ((status = 'PAID'::text) AND (payment_method = 'UPI'::text) AND (utr IS NULL) AND (transaction_reference IS NULL)))),
    CONSTRAINT upi_needs_vpa CHECK (((payment_method <> 'UPI'::text) OR (upi_id IS NOT NULL)))
);


ALTER TABLE public.expenses OWNER TO postgres;

--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_migrations (
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    password_hash text NOT NULL,
    currency character(3) DEFAULT 'INR'::bpchar NOT NULL,
    default_category text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_currency_check CHECK ((currency = 'INR'::bpchar)),
    CONSTRAINT users_email_check CHECK ((char_length(email) <= 254)),
    CONSTRAINT users_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT users_phone_check CHECK (((phone IS NULL) OR (phone ~ '^\+?[0-9]{10,15}$'::text)))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Data for Name: budgets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.budgets (id, user_id, category, amount_paise, period, thresholds, start_date, end_date, created_at, updated_at, deleted_at, server_updated_at) FROM stdin;
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, user_id, name, icon, color, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: expense_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.expense_events (id, expense_id, user_id, from_status, to_status, at, meta, created_at) FROM stdin;
520a78d2-fd8d-474d-a6bc-1630e0c2b186	ec2e24ee-57b3-4232-980e-b34ffedfedac	84267568-9ff8-4eab-9fc7-57d82a193952	\N	DRAFT	2026-09-29 11:12:08.816+05:30	\N	2026-09-29 11:45:23.298536+05:30
30dff110-6d27-4b35-8bfd-6e6486bbfba9	ec2e24ee-57b3-4232-980e-b34ffedfedac	84267568-9ff8-4eab-9fc7-57d82a193952	DRAFT	PENDING_PAYMENT	2026-09-29 11:12:08.816+05:30	\N	2026-09-29 11:45:23.316598+05:30
f51effd9-51d5-4ed6-b176-4cf48dae1f4b	ec2e24ee-57b3-4232-980e-b34ffedfedac	84267568-9ff8-4eab-9fc7-57d82a193952	PENDING_PAYMENT	PAYMENT_APP_OPENED	2026-09-29 11:12:20.278+05:30	\N	2026-09-29 11:45:23.324881+05:30
ae2d24b7-c69d-4a09-a73c-35ea4a418e60	ec2e24ee-57b3-4232-980e-b34ffedfedac	84267568-9ff8-4eab-9fc7-57d82a193952	PAYMENT_APP_OPENED	USER_RETURNED	2026-09-29 11:13:09.108+05:30	\N	2026-09-29 11:45:23.329363+05:30
e542ac18-2e5b-4735-ab30-499e6b415658	ec2e24ee-57b3-4232-980e-b34ffedfedac	84267568-9ff8-4eab-9fc7-57d82a193952	USER_RETURNED	FAILED	2026-09-29 11:13:15.344+05:30	\N	2026-09-29 11:45:23.334206+05:30
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.expenses (id, user_id, expense_code, amount_paise, currency, payee_name, upi_id, reason, category, status, payment_method, utr, transaction_reference, payment_app, qr_source, qr_payload, notes, created_at, expense_date, payment_initiated_at, payment_completed_at, updated_at, deleted_at, server_updated_at) FROM stdin;
ec2e24ee-57b3-4232-980e-b34ffedfedac	84267568-9ff8-4eab-9fc7-57d82a193952	EXP-20260929-0001	50000	INR	ANUJ KUMAR	6377189944-2@ybl	Travel	Travel	FAILED	UPI	\N	\N	UPI app	UPI_URI	{"mc": "0000", "pa": "6377189944-2@ybl", "pn": "ANUJ KUMAR", "mode": "02", "purpose": "00"}	\N	2026-09-29 11:12:08.816+05:30	2026-09-29 11:12:08.816+05:30	2026-09-29 11:12:20.278+05:30	\N	2026-09-29 11:13:15.344+05:30	\N	2026-09-29 11:45:23.337632+05:30
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) FROM stdin;
c46eb612-abb6-4d47-a0a2-56dd6c9fa616	84267568-9ff8-4eab-9fc7-57d82a193952	aacdd166c45436c6e4acf9b67027e8899e542c45ac8b3bcf779cc40d3007c945	2026-10-29 11:45:22.661981+05:30	2026-09-29 11:46:36.26768+05:30	2026-09-29 11:45:22.661981+05:30
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.schema_migrations (version, applied_at) FROM stdin;
001_init.sql	2026-09-27 10:53:00.752379+05:30
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, email, phone, password_hash, currency, default_category, created_at, updated_at) FROM stdin;
84267568-9ff8-4eab-9fc7-57d82a193952	Sandeep	sk74531614@gmail.com	7878808208	$2b$12$SLGCAgf8w5s2FP0EbTT8MO7TvirIDbRYGRWPsV2SKMOpa88eggauG	INR	\N	2026-09-29 11:45:22.657744+05:30	2026-09-29 11:45:22.657744+05:30
\.


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: expense_events expense_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expense_events
    ADD CONSTRAINT expense_events_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: budgets_user_cat_period_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX budgets_user_cat_period_uq ON public.budgets USING btree (user_id, category, period) WHERE (deleted_at IS NULL);


--
-- Name: categories_user_name_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX categories_user_name_uq ON public.categories USING btree (user_id, lower(name)) WHERE (deleted_at IS NULL);


--
-- Name: expense_events_expense_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX expense_events_expense_idx ON public.expense_events USING btree (expense_id, at);


--
-- Name: expenses_user_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX expenses_user_date_idx ON public.expenses USING btree (user_id, expense_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: expenses_user_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX expenses_user_status_idx ON public.expenses USING btree (user_id, status) WHERE (deleted_at IS NULL);


--
-- Name: expenses_user_sync_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX expenses_user_sync_idx ON public.expenses USING btree (user_id, server_updated_at);


--
-- Name: expenses_user_txnref_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX expenses_user_txnref_uq ON public.expenses USING btree (user_id, transaction_reference) WHERE ((transaction_reference IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: expenses_user_utr_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX expenses_user_utr_uq ON public.expenses USING btree (user_id, utr) WHERE ((utr IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: refresh_tokens_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX refresh_tokens_user_idx ON public.refresh_tokens USING btree (user_id);


--
-- Name: users_email_lower_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_email_lower_uq ON public.users USING btree (lower(email));


--
-- Name: budgets budgets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: categories categories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: expense_events expense_events_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expense_events
    ADD CONSTRAINT expense_events_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE;


--
-- Name: expense_events expense_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expense_events
    ADD CONSTRAINT expense_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict ioxnL2RgNBhXX8JRlKjYH5w1gTxvv72l5I66d9uvD0FYQQ7nKuiNAGClmGe6GfQ

