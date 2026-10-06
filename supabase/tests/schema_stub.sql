-- AUTO-GERADO a partir do schema real do projeto Supabase (mmm_imperium).
-- NAO editar a mao: regenerar com o dump da Management API quando o schema mudar.
-- serve como manequim para as migrations em um Postgres limpo (Docker).

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

do $$ begin if not exists (select 1 from pg_roles where rolname = 'postgres') then create role postgres login; end if; end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.local_uid', true), '')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select case when current_setting('test.local_uid', true) is null then 'anon' else 'authenticated' end;
$$;

create schema if not exists extensions;

create table public.admin_banking_accounts (
  id uuid default gen_random_uuid() not null,
  bank_name character varying(100) not null,
  account_type character varying(50) not null,
  bank_agency character varying(20) not null,
  bank_account character varying(30) not null,
  account_holder character varying(150) not null,
  document_cpf character varying(20) not null,
  pix_key character varying(200) not null,
  pix_key_type character varying(20) not null,
  is_default boolean default false,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint admin_banking_accounts_pkey PRIMARY KEY (id)
);

create table public.commission_history (
  id uuid default gen_random_uuid() not null,
  commission_id uuid,
  user_id uuid,
  amount numeric(20,8) not null,
  previous_balance numeric(20,8) not null,
  new_balance numeric(20,8) not null,
  description text,
  created_at timestamp with time zone default now(),
  constraint commission_history_pkey PRIMARY KEY (id)
);

create table public.commissions (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  source_user_id uuid,
  investment_id uuid,
  yield_id uuid,
  commission_type text not null,
  amount numeric(20,8) not null,
  percentage numeric(5,4) not null,
  level integer default 1,
  status text default 'pending'::text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint commissions_pkey PRIMARY KEY (id)
);

create table public.deposits (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  amount numeric(15,2) not null,
  method text not null,
  status text default 'pending'::text,
  transaction_hash text,
  proof_url text,
  description text,
  admin_notes text,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  admin_account_id uuid,
  bank_name text,
  account_holder text,
  reference text,
  wallet_address text,
  user_email text,
  constraint deposits_pkey PRIMARY KEY (id),
  constraint deposits_transaction_hash_key UNIQUE (transaction_hash)
);

create table public.financial_ledger (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  type text not null,
  amount numeric(15,2) not null,
  balance_before numeric(15,2) default 0 not null,
  balance_after numeric(15,2) not null,
  reference_id uuid,
  description text,
  created_at timestamp with time zone default now(),
  constraint financial_ledger_pkey PRIMARY KEY (id)
);

create table public.investments (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  amount numeric(15,2) default 0.00 not null,
  plan_slug character varying(50) default 'basic'::character varying not null,
  client_share integer default 50 not null,
  company_share integer default 50 not null,
  status character varying(20) default 'active'::character varying not null,
  daily_yield numeric(10,8) default 0.00 not null,
  total_yield numeric(15,2) default 0.00 not null,
  last_yield_calculated timestamp without time zone,
  created_at timestamp without time zone default now(),
  updated_at timestamp without time zone default now(),
  constraint investments_new_pkey PRIMARY KEY (id)
);

create table public.network_relations (
  id uuid default gen_random_uuid() not null,
  user_id text not null,
  user_email text,
  user_name text,
  referred_id text not null,
  referred_email text,
  referred_name text,
  level integer not null,
  total_generated numeric(20,8) default 0,
  status text default 'active'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint network_relations_pkey PRIMARY KEY (id)
);

create table public.plans (
  id uuid default gen_random_uuid() not null,
  slug character varying(50) not null,
  name character varying(100) not null,
  description text,
  is_active boolean default true,
  is_leadership boolean default false,
  sort_order integer default 0,
  min_amount numeric(10,2) not null,
  max_amount numeric(10,2) not null,
  base_rate numeric(5,4) default 0.0000,
  min_rate numeric(5,4) default 0.0000,
  max_rate numeric(5,4) default 0.0000,
  rate_increment numeric(5,4) default 0.0000,
  client_share integer default 50,
  company_share integer default 50,
  direct_commission integer default 10,
  reinvestment_commission integer default 10,
  residual_levels integer default 0,
  color character varying(20) default 'gold'::character varying,
  icon character varying(50) default 'Zap'::character varying,
  is_most_popular boolean default false,
  is_featured boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint plans_pkey PRIMARY KEY (id),
  constraint plans_slug_key UNIQUE (slug)
);

create table public.profiles (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  email text not null,
  full_name text,
  phone text,
  document_number text,
  birth_date date,
  address text,
  city text,
  state text,
  country text default 'Brasil'::text,
  postal_code text,
  referral_code text,
  referred_by uuid,
  kyc_status text default 'pending'::text,
  kyc_documents text[],
  is_active boolean default true,
  is_verified boolean default false,
  verification_level text default 'basic'::text,
  risk_score integer default 0,
  last_login timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  bank_name text,
  bank_agency text,
  bank_account text,
  pix_key text,
  crypto_wallet text,
  role text default 'user'::text,
  status text default 'active'::text,
  available_balance numeric(15,2) default 0,
  total_invested numeric(15,2) default 0,
  total_withdrawn numeric(15,2) default 0,
  total_earned numeric(15,2) default 0,
  referral_count integer default 0,
  direct_referrals integer default 0,
  referral_cod text,
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_referral_code_key UNIQUE (referral_code),
  constraint profiles_user_id_key UNIQUE (user_id)
);

create table public.transactions (
  id uuid default gen_random_uuid() not null,
  user_id text not null,
  user_email text,
  user_name text,
  type text not null,
  amount numeric(20,8) not null,
  fee numeric(20,8) default 0,
  penalty numeric(20,8) default 0,
  net_amount numeric(20,8),
  status text default 'pending'::text,
  description text,
  txid text,
  crypto_wallet text,
  transfer_to_user_id text,
  transfer_to_email text,
  investment_id text,
  related_user_id text,
  admin_notes text,
  processed_by text,
  processed_date timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint transactions_pkey PRIMARY KEY (id)
);

create table public.transfers (
  id uuid default gen_random_uuid() not null,
  from_user_id uuid,
  to_user_id uuid,
  amount numeric not null,
  status text default 'completed'::text,
  description text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  verification_code character varying(6),
  code_expires_at timestamp with time zone,
  verification_expires_at timestamp with time zone,
  completed_at timestamp with time zone,
  constraint transfers_pkey PRIMARY KEY (id)
);

create table public.user_network (
  user_id uuid not null,
  ancestor_id uuid not null,
  level integer not null,
  created_at timestamp with time zone default now(),
  constraint user_network_pkey PRIMARY KEY (user_id, ancestor_id)
);

create table public.user_settings (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  language text default 'pt-BR'::text,
  timezone text default 'America/Sao_Paulo'::text,
  currency text default 'BRL'::text,
  email_notifications boolean default true,
  sms_notifications boolean default false,
  push_notifications boolean default true,
  two_factor_enabled boolean default false,
  marketing_emails boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint user_settings_pkey PRIMARY KEY (id),
  constraint user_settings_user_id_key UNIQUE (user_id)
);

create table public.user_wallets (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  currency text not null,
  address text not null,
  network text default 'mainnet'::text,
  is_default boolean default false,
  is_active boolean default true,
  label text,
  balance numeric(20,8) default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint user_wallets_pkey PRIMARY KEY (id)
);

create table public.wallet_balances (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  wallet_balance numeric(15,2) default 0 not null,
  yield_balance numeric(15,2) default 0 not null,
  bonus_balance numeric(15,2) default 0 not null,
  locked_balance numeric(15,2) default 0 not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint wallet_balances_pkey PRIMARY KEY (id),
  constraint wallet_balances_user_id_key UNIQUE (user_id)
);

create table public.withdrawals (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  amount numeric(20,8) not null,
  method text not null,
  destination_address text not null,
  status text default 'pending'::text,
  transaction_hash text,
  admin_notes text,
  processing_fee numeric(20,8) default 0,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint withdrawals_pkey PRIMARY KEY (id),
  constraint withdrawals_transaction_hash_key UNIQUE (transaction_hash)
);

create table public.yields (
  id uuid default gen_random_uuid() not null,
  investment_id uuid,
  user_id uuid,
  amount numeric(15,2) not null,
  rate numeric(8,6) not null,
  client_yield numeric(15,2) not null,
  company_yield numeric(15,2) not null,
  date timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  constraint yields_pkey PRIMARY KEY (id)
);

do $$ begin
  alter table public.commission_history add constraint commission_history_commission_id_fkey FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.commission_history add constraint commission_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.commissions add constraint commissions_commission_type_check CHECK ((commission_type = ANY (ARRAY['direct'::text, 'residual'::text, 'reinvestment'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.commissions add constraint commissions_investment_id_fkey FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.commissions add constraint commissions_source_user_id_fkey FOREIGN KEY (source_user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.commissions add constraint commissions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.commissions add constraint commissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.commissions add constraint commissions_yield_id_fkey FOREIGN KEY (yield_id) REFERENCES yields(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.deposits add constraint deposits_method_check CHECK ((method = ANY (ARRAY['pix'::text, 'credit_card'::text, 'bank_transfer'::text, 'usdt'::text, 'crypto'::text, 'transfer'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.deposits add constraint deposits_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text, 'cancelled'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.deposits add constraint deposits_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.financial_ledger add constraint financial_ledger_type_check CHECK ((type = ANY (ARRAY['deposit'::text, 'withdrawal'::text, 'transfer_sent'::text, 'transfer_received'::text, 'investment'::text, 'yield'::text, 'bonus'::text, 'commission'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.financial_ledger add constraint financial_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.network_relations add constraint network_relations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.plans add constraint check_commissions_range CHECK ((((direct_commission >= 0) AND (direct_commission <= 100)) AND ((reinvestment_commission >= 0) AND (reinvestment_commission <= 100))));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.plans add constraint check_min_max_amount CHECK ((max_amount >= min_amount));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.plans add constraint check_rates_order CHECK (((max_rate >= base_rate) AND (base_rate >= min_rate)));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.plans add constraint check_residual_levels CHECK (((residual_levels >= 0) AND (residual_levels <= 20)));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.plans add constraint check_shares_range CHECK (((((client_share >= 0) AND (client_share <= 100)) AND ((company_share >= 0) AND (company_share <= 100))) OR ((client_share = 0) AND (company_share = 0) AND (is_leadership = true))));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.plans add constraint check_shares_total CHECK ((((client_share + company_share) = 100) OR ((client_share = 0) AND (company_share = 0) AND (is_leadership = true))));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.plans add constraint check_sort_order CHECK ((sort_order >= 0));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_kyc_status_check CHECK ((kyc_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'verification_required'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES profiles(user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'super_admin'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'banned'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_verification_level_check CHECK ((verification_level = ANY (ARRAY['basic'::text, 'advanced'::text, 'premium'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.transactions add constraint transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.transactions add constraint transactions_type_check CHECK ((type = ANY (ARRAY['deposit'::text, 'withdrawal'::text, 'transfer'::text, 'yield'::text, 'network_bonus'::text, 'referral_bonus'::text, 'reinvestment'::text, 'penalty'::text, 'career_bonus'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.transfers add constraint transfers_amount_check CHECK ((amount > (0)::numeric));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.transfers add constraint transfers_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.transfers add constraint transfers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'pending_verification'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.transfers add constraint transfers_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.user_network add constraint user_network_ancestor_id_fkey FOREIGN KEY (ancestor_id) REFERENCES auth.users(id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.user_network add constraint user_network_level_check CHECK (((level >= 1) AND (level <= 20)));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.user_network add constraint user_network_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.user_settings add constraint user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.user_wallets add constraint user_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wallet_balances add constraint wallet_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.withdrawals add constraint withdrawals_method_check CHECK ((method = ANY (ARRAY['pix'::text, 'bank_transfer'::text, 'usdt'::text, 'crypto'::text, 'manual'::text, 'transfer'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.withdrawals add constraint withdrawals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'processing'::text, 'completed'::text, 'cancelled'::text])));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.withdrawals add constraint withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.yields add constraint yields_investment_id_fkey FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.yields add constraint yields_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

create index if not exists idx_transactions_user_id ON public.transactions USING btree (user_id);
create index if not exists idx_transactions_type ON public.transactions USING btree (type);
create index if not exists idx_transactions_status ON public.transactions USING btree (status);
create index if not exists idx_transactions_created_at ON public.transactions USING btree (created_at);
create index if not exists idx_transactions_investment_id ON public.transactions USING btree (investment_id);
create index if not exists idx_financial_ledger_user_id ON public.financial_ledger USING btree (user_id);
create index if not exists idx_financial_ledger_created_at ON public.financial_ledger USING btree (created_at DESC);
create index if not exists idx_financial_ledger_reference_id ON public.financial_ledger USING btree (reference_id);
create index if not exists idx_ledger_user_id ON public.financial_ledger USING btree (user_id);
create index if not exists idx_ledger_type ON public.financial_ledger USING btree (type);
create index if not exists idx_ledger_created_at ON public.financial_ledger USING btree (created_at);
create index if not exists idx_network_relations_user_id ON public.network_relations USING btree (user_id);
create index if not exists idx_network_relations_referred_id ON public.network_relations USING btree (referred_id);
create index if not exists idx_network_relations_level ON public.network_relations USING btree (level);
create index if not exists idx_network_relations_status ON public.network_relations USING btree (status);
create unique index if not exists idx_network_relations_unique ON public.network_relations USING btree (user_id, referred_id);
create index if not exists idx_wallet_balances_user_id ON public.wallet_balances USING btree (user_id);
create index if not exists idx_user_wallets_user_id ON public.user_wallets USING btree (user_id);
create index if not exists idx_user_wallets_currency ON public.user_wallets USING btree (currency);
create index if not exists idx_user_wallets_is_default ON public.user_wallets USING btree (is_default);
create index if not exists idx_profiles_status ON public.profiles USING btree (status);
create index if not exists idx_profiles_user_id ON public.profiles USING btree (user_id);
create index if not exists idx_profiles_email ON public.profiles USING btree (email);
create index if not exists idx_profiles_referral_code ON public.profiles USING btree (referral_code);
create index if not exists idx_profiles_referred_by ON public.profiles USING btree (referred_by);
create index if not exists idx_profiles_kyc_status ON public.profiles USING btree (kyc_status);
create index if not exists idx_profiles_created_at ON public.profiles USING btree (created_at);
create index if not exists idx_profiles_role ON public.profiles USING btree (role);
create index if not exists idx_user_network_user_id ON public.user_network USING btree (user_id);
create index if not exists idx_user_network_ancestor_id ON public.user_network USING btree (ancestor_id);
create index if not exists idx_user_network_level ON public.user_network USING btree (level);
create index if not exists idx_plans_slug ON public.plans USING btree (slug);
create index if not exists idx_plans_active ON public.plans USING btree (is_active);
create index if not exists idx_plans_sort_order ON public.plans USING btree (sort_order);
create index if not exists idx_plans_min_amount ON public.plans USING btree (min_amount);
create index if not exists idx_deposits_user_id ON public.deposits USING btree (user_id);
create index if not exists idx_deposits_status ON public.deposits USING btree (status);
create index if not exists idx_deposits_created_at ON public.deposits USING btree (created_at);
create index if not exists idx_withdrawals_user_id ON public.withdrawals USING btree (user_id);
create index if not exists idx_withdrawals_status ON public.withdrawals USING btree (status);
create index if not exists idx_withdrawals_created_at ON public.withdrawals USING btree (created_at);
create index if not exists idx_commissions_user_id ON public.commissions USING btree (user_id);
create index if not exists idx_commissions_source_user_id ON public.commissions USING btree (source_user_id);
create index if not exists idx_commissions_investment_id ON public.commissions USING btree (investment_id);
create index if not exists idx_commissions_yield_id ON public.commissions USING btree (yield_id);
create index if not exists idx_commissions_status ON public.commissions USING btree (status);
create index if not exists idx_commissions_created_at ON public.commissions USING btree (created_at);
create index if not exists idx_commission_history_commission_id ON public.commission_history USING btree (commission_id);
create index if not exists idx_commission_history_user_id ON public.commission_history USING btree (user_id);
create index if not exists idx_commission_history_created_at ON public.commission_history USING btree (created_at);
create index if not exists idx_yields_investment_id ON public.yields USING btree (investment_id);
create index if not exists idx_yields_user_id ON public.yields USING btree (user_id);
create index if not exists idx_yields_date ON public.yields USING btree (date);
create index if not exists idx_transfers_verification_code ON public.transfers USING btree (verification_code) WHERE (verification_code IS NOT NULL);

-- plan_amount_view (view do outro produto) nao e recriada aqui: nao e usada pelo app.

alter table public.admin_banking_accounts enable row level security;
alter table public.commission_history enable row level security;
alter table public.commissions enable row level security;
alter table public.deposits enable row level security;
alter table public.financial_ledger enable row level security;
alter table public.investments enable row level security;
alter table public.network_relations enable row level security;
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.transfers enable row level security;
alter table public.user_network enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_wallets enable row level security;
alter table public.wallet_balances enable row level security;
alter table public.withdrawals enable row level security;
alter table public.yields enable row level security;

drop policy if exists "Admin pode atualizar contas bancÃ¡rias" on public.admin_banking_accounts;
create policy "Admin pode atualizar contas bancÃ¡rias" on public.admin_banking_accounts for UPDATE using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Admin pode deletar contas bancÃ¡rias" on public.admin_banking_accounts;
create policy "Admin pode deletar contas bancÃ¡rias" on public.admin_banking_accounts for DELETE using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Admin pode inserir contas bancÃ¡rias" on public.admin_banking_accounts;
create policy "Admin pode inserir contas bancÃ¡rias" on public.admin_banking_accounts for INSERT with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Admin pode ver contas bancÃ¡rias" on public.admin_banking_accounts;
create policy "Admin pode ver contas bancÃ¡rias" on public.admin_banking_accounts for SELECT using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Admins can view all commission history" on public.commission_history;
create policy "Admins can view all commission history" on public.commission_history for SELECT using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Users can view their own commission history" on public.commission_history;
create policy "Users can view their own commission history" on public.commission_history for SELECT using ((user_id = auth.uid()));
drop policy if exists "Admins can view all commissions" on public.commissions;
create policy "Admins can view all commissions" on public.commissions for SELECT using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Users can view their own commissions" on public.commissions;
create policy "Users can view their own commissions" on public.commissions for SELECT using ((user_id = auth.uid()));
drop policy if exists "Admins can view all deposits" on public.deposits;
create policy "Admins can view all deposits" on public.deposits for SELECT using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE (((profiles.user_id)::text = (auth.uid())::text) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Only service role updates deposit status" on public.deposits;
create policy "Only service role updates deposit status" on public.deposits for UPDATE using ((auth.role() = 'service_role'::text));
drop policy if exists "Users can create pending deposits" on public.deposits;
create policy "Users can create pending deposits" on public.deposits for INSERT with check (((auth.uid() = user_id) AND (status = 'pending'::text)));
drop policy if exists "Users can view own deposits" on public.deposits;
create policy "Users can view own deposits" on public.deposits for SELECT using ((auth.uid() = user_id));
drop policy if exists "Users can view their own deposits" on public.deposits;
create policy "Users can view their own deposits" on public.deposits for SELECT using (((user_id)::text = (auth.uid())::text));
drop policy if exists "No one can view ledger" on public.financial_ledger;
create policy "No one can view ledger" on public.financial_ledger for SELECT using (false);
drop policy if exists "Only service role can modify ledger" on public.financial_ledger;
create policy "Only service role can modify ledger" on public.financial_ledger for ALL using ((auth.role() = 'service_role'::text));
drop policy if exists "Only service role manages ledger" on public.financial_ledger;
create policy "Only service role manages ledger" on public.financial_ledger for ALL using ((auth.role() = 'service_role'::text));
drop policy if exists "Service role manages ledger" on public.financial_ledger;
create policy "Service role manages ledger" on public.financial_ledger for ALL using ((auth.role() = 'service_role'::text));
drop policy if exists "Users can view own ledger entries" on public.financial_ledger;
create policy "Users can view own ledger entries" on public.financial_ledger for SELECT using ((auth.uid() = user_id));
drop policy if exists "Only service role updates investments" on public.investments;
create policy "Only service role updates investments" on public.investments for UPDATE using ((auth.role() = 'service_role'::text));
drop policy if exists "Users can create investments" on public.investments;
create policy "Users can create investments" on public.investments for INSERT with check ((auth.uid() = user_id));
drop policy if exists "Users can view own investments" on public.investments;
create policy "Users can view own investments" on public.investments for SELECT using ((auth.uid() = user_id));
drop policy if exists "Users can insert network relations" on public.network_relations;
create policy "Users can insert network relations" on public.network_relations for INSERT with check (((auth.uid())::text = user_id));
drop policy if exists "Users can view network relations" on public.network_relations;
create policy "Users can view network relations" on public.network_relations for SELECT using ((((auth.uid())::text = user_id) OR ((auth.uid())::text = referred_id) OR (EXISTS ( SELECT 1
   FROM network_relations nr
  WHERE ((nr.user_id = network_relations.user_id) AND (nr.referred_id = (auth.uid())::text))))));
drop policy if exists "Users can view their network relations" on public.network_relations;
create policy "Users can view their network relations" on public.network_relations for SELECT using ((((auth.uid())::text = user_id) OR ((auth.uid())::text = referred_id)));
drop policy if exists "Admin full access to plans" on public.plans;
create policy "Admin full access to plans" on public.plans for ALL using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Everyone can read active plans" on public.plans;
create policy "Everyone can read active plans" on public.plans for SELECT using ((is_active = true));
drop policy if exists "Allow insert for new users" on public.profiles;
create policy "Allow insert for new users" on public.profiles for INSERT with check (true);
drop policy if exists "Service role can view all profiles" on public.profiles;
create policy "Service role can view all profiles" on public.profiles for SELECT using ((auth.role() = 'service_role'::text));
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for INSERT with check ((auth.uid() = user_id));
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for UPDATE using ((auth.uid() = user_id));
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles for SELECT using ((auth.uid() = user_id));
drop policy if exists "Users can view profiles" on public.profiles;
create policy "Users can view profiles" on public.profiles for SELECT using (((auth.uid() = user_id) OR true));
drop policy if exists "Users can insert their own transactions" on public.transactions;
create policy "Users can insert their own transactions" on public.transactions for INSERT with check (((auth.uid())::text = user_id));
drop policy if exists "Users can update their own transactions" on public.transactions;
create policy "Users can update their own transactions" on public.transactions for UPDATE using (((auth.uid())::text = user_id));
drop policy if exists "Users can view their own transactions" on public.transactions;
create policy "Users can view their own transactions" on public.transactions for SELECT using (((auth.uid())::text = user_id));
drop policy if exists "Only service role creates transfers" on public.transfers;
create policy "Only service role creates transfers" on public.transfers for INSERT with check ((auth.role() = 'service_role'::text));
drop policy if exists "Users can create transfers" on public.transfers;
create policy "Users can create transfers" on public.transfers for INSERT with check ((from_user_id = auth.uid()));
drop policy if exists "Users can view own transfers" on public.transfers;
create policy "Users can view own transfers" on public.transfers for SELECT using (((auth.uid() = from_user_id) OR (auth.uid() = to_user_id)));
drop policy if exists "Users can view their own transfers" on public.transfers;
create policy "Users can view their own transfers" on public.transfers for SELECT using (((from_user_id = auth.uid()) OR (to_user_id = auth.uid())));
drop policy if exists "Only service role manages network" on public.user_network;
create policy "Only service role manages network" on public.user_network for ALL using ((auth.role() = 'service_role'::text));
drop policy if exists "Users can view network" on public.user_network;
create policy "Users can view network" on public.user_network for SELECT using (((auth.uid() = user_id) OR (auth.uid() = ancestor_id) OR (EXISTS ( SELECT 1
   FROM user_network un
  WHERE ((un.user_id = user_network.user_id) AND (un.ancestor_id = auth.uid()))))));
drop policy if exists "Users can view network relations" on public.user_network;
create policy "Users can view network relations" on public.user_network for SELECT using (((auth.uid() = user_id) OR (auth.uid() = ancestor_id) OR (EXISTS ( SELECT 1
   FROM user_network un
  WHERE ((un.user_id = user_network.user_id) AND (un.ancestor_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM user_network un
  WHERE ((un.user_id = auth.uid()) AND (un.ancestor_id = user_network.ancestor_id))))));
drop policy if exists "Users can insert their own settings" on public.user_settings;
create policy "Users can insert their own settings" on public.user_settings for INSERT with check ((auth.uid() = user_id));
drop policy if exists "Users can update their own settings" on public.user_settings;
create policy "Users can update their own settings" on public.user_settings for UPDATE using ((auth.uid() = user_id));
drop policy if exists "Users can view their own settings" on public.user_settings;
create policy "Users can view their own settings" on public.user_settings for SELECT using ((auth.uid() = user_id));
drop policy if exists "Users can insert their own wallets" on public.user_wallets;
create policy "Users can insert their own wallets" on public.user_wallets for INSERT with check ((auth.uid() = user_id));
drop policy if exists "Users can update their own wallets" on public.user_wallets;
create policy "Users can update their own wallets" on public.user_wallets for UPDATE using ((auth.uid() = user_id));
drop policy if exists "Users can view their own wallets" on public.user_wallets;
create policy "Users can view their own wallets" on public.user_wallets for SELECT using ((auth.uid() = user_id));
drop policy if exists "Only service role can modify wallet balances" on public.wallet_balances;
create policy "Only service role can modify wallet balances" on public.wallet_balances for ALL using ((auth.role() = 'service_role'::text));
drop policy if exists "Only service role modifies wallet balances" on public.wallet_balances;
create policy "Only service role modifies wallet balances" on public.wallet_balances for ALL using ((auth.role() = 'service_role'::text));
drop policy if exists "Users can view own wallet balances" on public.wallet_balances;
create policy "Users can view own wallet balances" on public.wallet_balances for SELECT using ((auth.uid() = user_id));
drop policy if exists "Admins can update withdrawals" on public.withdrawals;
create policy "Admins can update withdrawals" on public.withdrawals for UPDATE using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE (((profiles.user_id)::text = (auth.uid())::text) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Admins can view all withdrawals" on public.withdrawals;
create policy "Admins can view all withdrawals" on public.withdrawals for SELECT using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE (((profiles.user_id)::text = (auth.uid())::text) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Only service role updates withdrawal status" on public.withdrawals;
create policy "Only service role updates withdrawal status" on public.withdrawals for UPDATE using ((auth.role() = 'service_role'::text));
drop policy if exists "Users can create pending withdrawals" on public.withdrawals;
create policy "Users can create pending withdrawals" on public.withdrawals for INSERT with check (((auth.uid() = user_id) AND (status = 'pending'::text)));
drop policy if exists "Users can create withdrawals" on public.withdrawals;
create policy "Users can create withdrawals" on public.withdrawals for INSERT with check (((user_id)::text = (auth.uid())::text));
drop policy if exists "Users can view own withdrawals" on public.withdrawals;
create policy "Users can view own withdrawals" on public.withdrawals for SELECT using ((auth.uid() = user_id));
drop policy if exists "Users can view their own withdrawals" on public.withdrawals;
create policy "Users can view their own withdrawals" on public.withdrawals for SELECT using (((user_id)::text = (auth.uid())::text));
drop policy if exists "Admin insert policy" on public.yields;
create policy "Admin insert policy" on public.yields for INSERT with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Admin select policy" on public.yields;
create policy "Admin select policy" on public.yields for SELECT using (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))) OR (user_id = auth.uid())));
drop policy if exists "Admin update policy" on public.yields;
create policy "Admin update policy" on public.yields for UPDATE using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.user_id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
drop policy if exists "Service role insert policy" on public.yields;
create policy "Service role insert policy" on public.yields for INSERT with check ((auth.role() = 'service_role'::text));
drop policy if exists "User select policy" on public.yields;
create policy "User select policy" on public.yields for SELECT using ((user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.check_rls_status()
 RETURNS TABLE(table_name text, rls_enabled boolean)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        c.relname::TEXT,
        c.relrowsecurity::BOOLEAN as rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN (
        'financial_ledger', 'wallet_balances', 'deposits', 'withdrawals',
        'transfers', 'investments', 'profiles', 'user_network'
    )
    ORDER BY c.relname;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.create_profile_with_referral(p_user_id uuid, p_email text, p_full_name text DEFAULT NULL::text, p_referral_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  profile_id UUID;
  referrer_id UUID;
BEGIN
  -- Check if referral code is valid
  IF p_referral_code IS NOT NULL THEN
    SELECT user_id INTO referrer_id FROM profiles WHERE referral_code = p_referral_code;
    IF referrer_id IS NULL THEN
      RAISE EXCEPTION 'Invalid referral code';
    END IF;
  END IF;

  -- Create profile
  INSERT INTO profiles (user_id, email, full_name, referral_code, referred_by)
  VALUES (
    p_user_id,
    p_email,
    p_full_name,
    generate_referral_code(),
    referrer_id
  )
  RETURNING id INTO profile_id;

  -- Create default settings
  INSERT INTO user_settings (user_id) VALUES (p_user_id);

  RETURN profile_id;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.execute_transfer_atomic(p_sender_id uuid, p_recipient_id uuid, p_amount numeric, p_description text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_transfer_id UUID;
    v_sender_balance DECIMAL(15,2);
BEGIN
    -- Verificar saldo usando funÃ§Ã£o de cÃ¡lculo
    v_sender_balance := get_user_available_balance(p_sender_id);

    IF v_sender_balance < p_amount THEN
        RAISE EXCEPTION 'Saldo insuficiente. DisponÃ­vel: %, NecessÃ¡rio: %', v_sender_balance, p_amount;
    END IF;

    -- Criar transferÃªncia na tabela existente
    INSERT INTO transfers (from_user_id, to_user_id, amount, status, description)
    VALUES (p_sender_id, p_recipient_id, p_amount, 'completed', p_description)
    RETURNING id INTO v_transfer_id;

    -- Registrar no ledger para auditoria
    INSERT INTO financial_ledger (user_id, type, amount, balance_after, reference_id, reference_type, description)
    VALUES (p_sender_id, 'transfer_sent', -p_amount, v_sender_balance - p_amount, v_transfer_id, 'transfer', 'TransferÃªncia enviada para ' || p_recipient_id::TEXT);

    INSERT INTO financial_ledger (user_id, type, amount, balance_after, reference_id, reference_type, description)
    VALUES (p_recipient_id, 'transfer_received', p_amount, get_user_available_balance(p_recipient_id) + p_amount, v_transfer_id, 'transfer', 'TransferÃªncia recebida de ' || p_sender_id::TEXT);

    RETURN json_build_object(
        'id', v_transfer_id,
        'from_user_id', p_sender_id,
        'to_user_id', p_recipient_id,
        'amount', p_amount,
        'status', 'completed',
        'created_at', NOW()
    );
END;
$function$

;

CREATE OR REPLACE FUNCTION public.generate_referral_code()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    code := upper(substr(md5(random()::text), 1, 8));
    SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = code) INTO exists;
    IF NOT exists THEN
      EXIT;
    END IF;
  END LOOP;
  RETURN code;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.get_available_balance(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_wallet DECIMAL(15,2);
    v_yield DECIMAL(15,2);
    v_bonus DECIMAL(15,2);
BEGIN
    SELECT wallet_balance, yield_balance, bonus_balance
    INTO v_wallet, v_yield, v_bonus
    FROM wallet_balances
    WHERE user_id = p_user_id;

    RETURN COALESCE(v_wallet, 0) + COALESCE(v_yield, 0) + COALESCE(v_bonus, 0);
END;
$function$

;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Insert profile with all required fields from auth.users
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,                    -- user_id from auth.users
    NEW.email,                 -- email from auth.users
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)  -- full_name from metadata or fallback to email
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the user creation
    RAISE LOG 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.insert_ledger_entry(p_user_id uuid, p_type text, p_amount numeric, p_reference_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_balance_before DECIMAL(15,2);
    v_balance_after DECIMAL(15,2);
    v_entry_id UUID;
BEGIN
    -- Buscar saldo anterior
    SELECT get_user_balance(p_user_id) INTO v_balance_before;

    -- Calcular novo saldo
    v_balance_after := v_balance_before + p_amount;

    -- Inserir entrada
    INSERT INTO financial_ledger (
        user_id, type, amount, balance_before, balance_after,
        reference_id, description
    ) VALUES (
        p_user_id, p_type, p_amount, v_balance_before, v_balance_after,
        p_reference_id, p_description
    ) RETURNING id INTO v_entry_id;

    RETURN v_entry_id;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.sync_network_relations_to_user_network()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_sponsor_id UUID;
BEGIN
    -- Tentar converter referred_id para UUID
    BEGIN
        v_sponsor_id := NEW.referred_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        -- Se nÃ£o conseguir converter, tentar buscar pelo email
        SELECT user_id INTO v_sponsor_id
        FROM profiles
        WHERE email = NEW.referred_email
        LIMIT 1;
    END;

    IF v_sponsor_id IS NOT NULL THEN
        -- Inserir na nova estrutura
        INSERT INTO user_network (user_id, ancestor_id, level)
        VALUES (NEW.user_id::UUID, v_sponsor_id, COALESCE(NEW.level, 1))
        ON CONFLICT (user_id, ancestor_id) DO UPDATE SET
            level = EXCLUDED.level;
    END IF;

    RETURN NEW;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.sync_profile_to_wallet_balances()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO wallet_balances (
        user_id,
        wallet_balance,
        yield_balance,
        bonus_balance,
        locked_balance
    ) VALUES (
        NEW.user_id,
        COALESCE(NEW.available_balance, 0),
        COALESCE(NEW.total_earned, 0),
        0,  -- bonus_balance separado
        0   -- locked_balance comeÃ§a zerado
    )
    ON CONFLICT (user_id) DO UPDATE SET
        wallet_balance = EXCLUDED.wallet_balance,
        yield_balance = EXCLUDED.yield_balance,
        bonus_balance = wallet_balances.bonus_balance,  -- mantÃ©m valor atual
        locked_balance = wallet_balances.locked_balance, -- mantÃ©m valor atual
        updated_at = NOW();

    RETURN NEW;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.update_admin_banking_accounts_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.update_wallet_balance(p_user_id uuid, p_wallet_delta numeric DEFAULT 0, p_yield_delta numeric DEFAULT 0, p_bonus_delta numeric DEFAULT 0, p_locked_delta numeric DEFAULT 0)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO wallet_balances (user_id, wallet_balance, yield_balance, bonus_balance, locked_balance)
    VALUES (p_user_id, GREATEST(p_wallet_delta, 0), GREATEST(p_yield_delta, 0), GREATEST(p_bonus_delta, 0), GREATEST(p_locked_delta, 0))
    ON CONFLICT (user_id) DO UPDATE SET
        wallet_balance = GREATEST(wallet_balances.wallet_balance + p_wallet_delta, 0),
        yield_balance = GREATEST(wallet_balances.yield_balance + p_yield_delta, 0),
        bonus_balance = GREATEST(wallet_balances.bonus_balance + p_bonus_delta, 0),
        locked_balance = GREATEST(wallet_balances.locked_balance + p_locked_delta, 0);

    RETURN TRUE;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.update_wallet_balances_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$

;

create trigger admin_banking_accounts_updated_at BEFORE UPDATE ON public.admin_banking_accounts FOR EACH ROW execute function update_admin_banking_accounts_updated_at();
create trigger set_commission_history_timestamp BEFORE UPDATE ON public.commission_history FOR EACH ROW execute function trigger_set_timestamp();
create trigger set_commissions_timestamp BEFORE UPDATE ON public.commissions FOR EACH ROW execute function trigger_set_timestamp();
create trigger set_deposits_timestamp BEFORE UPDATE ON public.deposits FOR EACH ROW execute function trigger_set_timestamp();
create trigger sync_network_to_user_network AFTER INSERT OR UPDATE ON public.network_relations FOR EACH ROW execute function sync_network_relations_to_user_network();
create trigger update_network_relations_updated_at BEFORE UPDATE ON public.network_relations FOR EACH ROW execute function update_updated_at_column();
create trigger set_timestamp BEFORE UPDATE ON public.plans FOR EACH ROW execute function trigger_set_timestamp();
create trigger sync_profile_balances AFTER INSERT OR UPDATE OF available_balance, total_earned ON public.profiles FOR EACH ROW execute function sync_profile_to_wallet_balances();
create trigger trigger_sync_profile_to_wallet AFTER INSERT OR UPDATE ON public.profiles FOR EACH ROW execute function sync_profile_to_wallet_balances();
create trigger update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW execute function update_updated_at_column();
create trigger update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW execute function update_updated_at_column();
create trigger update_transfers_updated_at BEFORE UPDATE ON public.transfers FOR EACH ROW execute function update_updated_at_column();
create trigger update_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW execute function update_updated_at_column();
create trigger update_user_wallets_updated_at BEFORE UPDATE ON public.user_wallets FOR EACH ROW execute function update_updated_at_column();
create trigger trigger_wallet_balances_updated_at BEFORE UPDATE ON public.wallet_balances FOR EACH ROW execute function update_wallet_balances_updated_at();
create trigger set_withdrawals_timestamp BEFORE UPDATE ON public.withdrawals FOR EACH ROW execute function trigger_set_timestamp();
create trigger on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW execute function handle_new_user();

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Dados de partida para os testes de aceitacao.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user@teste.com'),
  ('22222222-2222-2222-2222-222222222222', 'admin@teste.com');

insert into public.profiles (id, user_id, email, full_name, referral_code, role, status)
values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'user@teste.com', 'Usuario Teste', 'REFUSER01', 'user', 'active'),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'admin@teste.com', 'Admin Teste', 'REFADMIN1', 'admin', 'active')
on conflict (user_id) do update
  set email = excluded.email, full_name = excluded.full_name,
      referral_code = coalesce(public.profiles.referral_code, excluded.referral_code),
      role = excluded.role, status = excluded.status;

insert into public.wallet_balances (user_id, wallet_balance, bonus_balance)
select u.user_id, 1000, 100 from public.profiles u
on conflict (user_id) do update set wallet_balance = 1000, bonus_balance = 100;
