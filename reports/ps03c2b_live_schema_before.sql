--
-- PostgreSQL database dump
--

\restrict tOkgkAVIFVph1Xun42yvinQE8nhblD04mZXZRamNGgdoR6WUdJBVJYgSZhCtDBi

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

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
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO postgres;

--
-- Name: account_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.account_status AS ENUM (
    'active',
    'disabled'
);


ALTER TYPE public.account_status OWNER TO postgres;

--
-- Name: account_status_override; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.account_status_override AS ENUM (
    'SOLD',
    'INACTIVE'
);


ALTER TYPE public.account_status_override OWNER TO postgres;

--
-- Name: admin_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.admin_status AS ENUM (
    'active',
    'inactive'
);


ALTER TYPE public.admin_status OWNER TO postgres;

--
-- Name: backup_code_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.backup_code_status AS ENUM (
    'AVAILABLE',
    'USED',
    'REVOKED'
);


ALTER TYPE public.backup_code_status OWNER TO postgres;

--
-- Name: capacity_customer_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.capacity_customer_status AS ENUM (
    'active',
    'removed',
    'cancelled'
);


ALTER TYPE public.capacity_customer_status OWNER TO postgres;

--
-- Name: capacity_kind; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.capacity_kind AS ENUM (
    'Z2_PS5',
    'Z2_PS4',
    'Z3_PS5'
);


ALTER TYPE public.capacity_kind OWNER TO postgres;

--
-- Name: capacity_kind_v2; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.capacity_kind_v2 AS ENUM (
    'Z2_PS5',
    'Z2_PS4',
    'Z3_SHARED_PS5_PS4'
);


ALTER TYPE public.capacity_kind_v2 OWNER TO postgres;

--
-- Name: capacity_platform; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.capacity_platform AS ENUM (
    'PS4',
    'PS5'
);


ALTER TYPE public.capacity_platform OWNER TO postgres;

--
-- Name: game_platform; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.game_platform AS ENUM (
    'PS5_ONLY',
    'PS4_AND_PS5',
    'PS4_ONLY'
);


ALTER TYPE public.game_platform OWNER TO postgres;

--
-- Name: game_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.game_status AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


ALTER TYPE public.game_status OWNER TO postgres;

--
-- Name: order_source; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.order_source AS ENUM (
    'manual',
    'woocommerce',
    'api'
);


ALTER TYPE public.order_source OWNER TO postgres;

--
-- Name: order_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.order_status AS ENUM (
    'pending_assignment',
    'assigned',
    'delivered',
    'failed',
    'cancelled'
);


ALTER TYPE public.order_status OWNER TO postgres;

--
-- Name: accounts_protect_identifiers_fn(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.accounts_protect_identifiers_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	IF (OLD."account_code" IS DISTINCT FROM NEW."account_code")
		OR (OLD."account_number_prefix" IS DISTINCT FROM NEW."account_number_prefix")
		OR (OLD."account_number_seq" IS DISTINCT FROM NEW."account_number_seq")
		OR (OLD."display_number" IS DISTINCT FROM NEW."display_number") THEN
		RAISE EXCEPTION 'Account identifiers are immutable';
	END IF;
	RETURN NEW;
END;
$$;


ALTER FUNCTION public.accounts_protect_identifiers_fn() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: postgres
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: postgres
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: postgres
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: account_backup_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_backup_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    code_encrypted text NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    code_encrypted_v2 text,
    code_lookup_hash_v2 text,
    status public.backup_code_status DEFAULT 'AVAILABLE'::public.backup_code_status NOT NULL
);


ALTER TABLE public.account_backup_codes OWNER TO postgres;

--
-- Name: account_capacities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_capacities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    capacity_kind public.capacity_kind NOT NULL,
    instance_no integer NOT NULL,
    display_label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    capacity_kind_v2 public.capacity_kind_v2,
    is_finished boolean DEFAULT false NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT account_capacities_finished_consistency CHECK ((((is_finished = false) AND (finished_at IS NULL)) OR ((is_finished = true) AND (finished_at IS NOT NULL))))
);


ALTER TABLE public.account_capacities OWNER TO postgres;

--
-- Name: account_code_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.account_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 2147483647
    CACHE 1;


ALTER SEQUENCE public.account_code_seq OWNER TO postgres;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id uuid NOT NULL,
    account_code text NOT NULL,
    account_number_prefix text NOT NULL,
    account_number_seq integer NOT NULL,
    display_number text NOT NULL,
    email text NOT NULL,
    email_normalized text NOT NULL,
    playstation_password_encrypted text NOT NULL,
    email_password_encrypted text NOT NULL,
    family_management_email_encrypted text,
    online_id text,
    birth_date text,
    status public.account_status DEFAULT 'active'::public.account_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    psn_email_encrypted text,
    psn_email_lookup_hash text,
    psn_password_encrypted text,
    psn_password_lookup_hash text,
    email_password_encrypted_v2 text,
    email_password_lookup_hash text,
    family_management_email_encrypted_v2 text,
    family_management_email_lookup_hash text,
    status_override public.account_status_override
);


ALTER TABLE public.accounts OWNER TO postgres;

--
-- Name: admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    status public.admin_status DEFAULT 'active'::public.admin_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.admins OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id text,
    before jsonb,
    after jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: capacity_customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.capacity_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    capacity_id uuid NOT NULL,
    order_id uuid NOT NULL,
    customer_phone_encrypted text NOT NULL,
    customer_phone_blind_index text,
    status public.capacity_customer_status DEFAULT 'active'::public.capacity_customer_status NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.capacity_customers OWNER TO postgres;

--
-- Name: game_account_sequences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.game_account_sequences (
    game_id uuid NOT NULL,
    last_value integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.game_account_sequences OWNER TO postgres;

--
-- Name: games; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.games (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    cover_url text,
    platform public.game_platform NOT NULL,
    status public.game_status DEFAULT 'ACTIVE'::public.game_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    title_normalized text NOT NULL,
    CONSTRAINT games_title_max_length CHECK ((length(title) <= 120)),
    CONSTRAINT games_title_normalized_max_length CHECK ((length(title_normalized) <= 120)),
    CONSTRAINT games_title_normalized_not_blank CHECK ((length(TRIM(BOTH FROM title_normalized)) > 0)),
    CONSTRAINT games_title_not_blank CHECK ((length(TRIM(BOTH FROM title)) > 0))
);


ALTER TABLE public.games OWNER TO postgres;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_code text NOT NULL,
    source public.order_source DEFAULT 'manual'::public.order_source NOT NULL,
    status public.order_status DEFAULT 'pending_assignment'::public.order_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: account_backup_codes account_backup_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_backup_codes
    ADD CONSTRAINT account_backup_codes_pkey PRIMARY KEY (id);


--
-- Name: account_capacities account_capacities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_capacities
    ADD CONSTRAINT account_capacities_pkey PRIMARY KEY (id);


--
-- Name: account_capacities account_capacities_unique_slot; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_capacities
    ADD CONSTRAINT account_capacities_unique_slot UNIQUE (account_id, capacity_kind, instance_no);


--
-- Name: accounts accounts_account_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_account_code_unique UNIQUE (account_code);


--
-- Name: accounts accounts_game_display_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_game_display_unique UNIQUE (game_id, display_number);


--
-- Name: accounts accounts_game_seq_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_game_seq_unique UNIQUE (game_id, account_number_seq);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- Name: admins admins_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_username_unique UNIQUE (username);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: capacity_customers capacity_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.capacity_customers
    ADD CONSTRAINT capacity_customers_pkey PRIMARY KEY (id);


--
-- Name: game_account_sequences game_account_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_account_sequences
    ADD CONSTRAINT game_account_sequences_pkey PRIMARY KEY (game_id);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_code_unique UNIQUE (order_code);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: account_backup_codes_account_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_backup_codes_account_id_idx ON public.account_backup_codes USING btree (account_id);


--
-- Name: account_backup_codes_code_lookup_hash_v2_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_backup_codes_code_lookup_hash_v2_idx ON public.account_backup_codes USING btree (code_lookup_hash_v2);


--
-- Name: account_backup_codes_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_backup_codes_status_idx ON public.account_backup_codes USING btree (status);


--
-- Name: account_capacities_account_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_capacities_account_id_idx ON public.account_capacities USING btree (account_id);


--
-- Name: account_capacities_is_finished_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_capacities_is_finished_idx ON public.account_capacities USING btree (is_finished);


--
-- Name: account_capacities_v2_unique_slot; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX account_capacities_v2_unique_slot ON public.account_capacities USING btree (account_id, capacity_kind_v2, instance_no) WHERE (capacity_kind_v2 IS NOT NULL);


--
-- Name: accounts_account_code_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX accounts_account_code_idx ON public.accounts USING btree (account_code);


--
-- Name: accounts_deleted_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX accounts_deleted_at_idx ON public.accounts USING btree (deleted_at);


--
-- Name: accounts_email_normalized_active_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX accounts_email_normalized_active_uniq ON public.accounts USING btree (email_normalized) WHERE (deleted_at IS NULL);


--
-- Name: accounts_email_password_lookup_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX accounts_email_password_lookup_hash_idx ON public.accounts USING btree (email_password_lookup_hash);


--
-- Name: accounts_family_email_lookup_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX accounts_family_email_lookup_hash_idx ON public.accounts USING btree (family_management_email_lookup_hash);


--
-- Name: accounts_game_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX accounts_game_id_idx ON public.accounts USING btree (game_id);


--
-- Name: accounts_online_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX accounts_online_id_idx ON public.accounts USING btree (online_id);


--
-- Name: accounts_psn_email_lookup_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX accounts_psn_email_lookup_hash_idx ON public.accounts USING btree (psn_email_lookup_hash);


--
-- Name: accounts_psn_password_lookup_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX accounts_psn_password_lookup_hash_idx ON public.accounts USING btree (psn_password_lookup_hash);


--
-- Name: accounts_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX accounts_status_idx ON public.accounts USING btree (status);


--
-- Name: audit_logs_admin_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_admin_id_idx ON public.audit_logs USING btree (admin_id);


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at);


--
-- Name: audit_logs_entity_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_entity_id_idx ON public.audit_logs USING btree (entity_id);


--
-- Name: audit_logs_entity_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (entity);


--
-- Name: capacity_customers_active_assignment_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX capacity_customers_active_assignment_uniq ON public.capacity_customers USING btree (capacity_id, order_id) WHERE (status = 'active'::public.capacity_customer_status);


--
-- Name: capacity_customers_capacity_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX capacity_customers_capacity_id_idx ON public.capacity_customers USING btree (capacity_id);


--
-- Name: capacity_customers_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX capacity_customers_order_id_idx ON public.capacity_customers USING btree (order_id);


--
-- Name: capacity_customers_phone_blind_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX capacity_customers_phone_blind_idx ON public.capacity_customers USING btree (customer_phone_blind_index);


--
-- Name: capacity_customers_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX capacity_customers_status_idx ON public.capacity_customers USING btree (status);


--
-- Name: games_deleted_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX games_deleted_at_idx ON public.games USING btree (deleted_at);


--
-- Name: games_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX games_status_idx ON public.games USING btree (status);


--
-- Name: games_title_normalized_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX games_title_normalized_uniq ON public.games USING btree (title_normalized);


--
-- Name: orders_deleted_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_deleted_at_idx ON public.orders USING btree (deleted_at);


--
-- Name: orders_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_source_idx ON public.orders USING btree (source);


--
-- Name: orders_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_status_idx ON public.orders USING btree (status);


--
-- Name: accounts accounts_protect_identifiers_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER accounts_protect_identifiers_trigger BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.accounts_protect_identifiers_fn();


--
-- Name: account_backup_codes account_backup_codes_account_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_backup_codes
    ADD CONSTRAINT account_backup_codes_account_id_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: account_capacities account_capacities_account_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_capacities
    ADD CONSTRAINT account_capacities_account_id_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: accounts accounts_game_id_games_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- Name: audit_logs audit_logs_admin_id_admins_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_admin_id_admins_id_fk FOREIGN KEY (admin_id) REFERENCES public.admins(id);


--
-- Name: capacity_customers capacity_customers_capacity_id_account_capacities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.capacity_customers
    ADD CONSTRAINT capacity_customers_capacity_id_account_capacities_id_fk FOREIGN KEY (capacity_id) REFERENCES public.account_capacities(id);


--
-- Name: capacity_customers capacity_customers_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.capacity_customers
    ADD CONSTRAINT capacity_customers_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: game_account_sequences game_account_sequences_game_id_games_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_account_sequences
    ADD CONSTRAINT game_account_sequences_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- PostgreSQL database dump complete
--

\unrestrict tOkgkAVIFVph1Xun42yvinQE8nhblD04mZXZRamNGgdoR6WUdJBVJYgSZhCtDBi

