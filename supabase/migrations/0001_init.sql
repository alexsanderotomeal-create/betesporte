-- PrimasBet — schema inicial, adaptado ao banco REAL (projeto mmm_imperium)
--
-- Este banco ja pertence a outro produto (rede de indicacao, planos, produto
-- fisico) e tem dados vivos (9 perfis, 2 depositos). Nenhuma tabela dele e
-- recriada nem apagada: a aplicacao PRIMA POR CIMA usando as colunas que ja
-- existem.
--
-- Tabelas reaproveitadas e o que mudou em relacao ao schema antigo:
--   profiles         (id uuid PK, user_id uuid UNIQUE FK auth.users, email NOT
--                     NULL, role check user/admin/super_admin, status check
--                     active/inactive/suspended/banned, kyc_status, document_
--                     number, referral_code UNIQUE, referred_by, available_
--                     balance, ...). NAO tem username/is_admin/is_banned/cpf.
--   wallet_balances  (user_id UNIQUE FK auth.users, wallet_balance, yield_
--                     balance, bonus_balance, locked_balance numeric(15,2) NOT
--                     NULL default 0)
--   financial_ledger (user_id FK auth.users, type check de 8 tipos, amount,
--                     balance_before/after, reference_id uuid, description)
--   deposits         (id uuid PK, user_id FK profiles(user_id), amount
--                     numeric(15,2), method check pix/credit_card/bank_transfer/
--                     usdt/crypto/transfer, status check pending/confirmed/
--                     rejected/cancelled, transaction_hash UNIQUE, reference,
--                     proof_url, user_email, wallet_address)
--   withdrawals      (id uuid PK, user_id FK profiles(user_id), amount
--                     numeric(20,8), method check pix/bank_transfer/usdt/crypto/
--                     manual/transfer, destination_address NOT NULL, status
--                     check pending/approved/rejected/processing/completed/
--                     cancelled, transaction_hash UNIQUE)
--
-- O que NAO existe no banco real e criado aqui:
--   system_settings, activity_logs, leagues, teams, matches, match_markets,
--   market_choices, bets   (eleicoes vem na migration 0003)
--
-- Restricoes de vocabulario deste banco:
--   * deposits.status usa 'confirmed', nao 'approved'. O app normaliza
--     'confirmed' -> 'approved' na leitura; as RPC de 0002 escrevem 'confirmed'.
--   * withdrawals.status ja aceita 'approved'.
--   * financial_ledger.type e minusculo (deposit/bonus/withdrawal/...).
--   * o trigger on_auth_user_created + handle_new_user JA EXISTEM no banco
--     real (criam o profile ao cadastrar). NAO sao recriados aqui.
--   * wallet_balances NAO e criada pelo handle_new_user: nasce sob demanda
--     via UPSERT nas RPC de 0002.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- extend financial_ledger_type_check com os tipos de aposta
-- ---------------------------------------------------------------------------
-- Os 8 tipos atuais NAO incluem aposta. Adicionar bet/bet_winnings/bet_refund
-- e a unica alteracao em tabela que ja existe no banco real.

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    where c.conname = 'financial_ledger_type_check'
      and pg_get_constraintdef(c.oid) like '%''bet''%'
  ) then
    alter table public.financial_ledger drop constraint financial_ledger_type_check;
    alter table public.financial_ledger
      add constraint financial_ledger_type_check check (
        type in (
          'deposit', 'withdrawal', 'transfer_sent', 'transfer_received',
          'investment', 'yield', 'bonus', 'commission',
          'bet', 'bet_winnings', 'bet_refund'
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- system_settings — parametros da casa (nao existe no banco real)
-- ---------------------------------------------------------------------------

create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (key, value)
select v.key, v.value
from (values
  ('min_deposit', '20'),
  ('min_withdraw', '30'),
  ('welcome_bonus_enabled', 'true'),
  ('welcome_bonus_percent', '100'),
  ('house_margin', '1.0500'),
  ('maintenance_mode', 'false'),
  ('deposit_methods', 'pix,bank_transfer,usdt,crypto'),
  ('withdraw_methods', 'pix,usdt,crypto,bank_transfer')
) as v(key, value)
where not exists (select 1 from public.system_settings s where s.key = v.key);

-- ---------------------------------------------------------------------------
-- activity_logs — rastro de operacao (nao existe no banco real)
-- ---------------------------------------------------------------------------
-- user_id aponta para o usuario autenticado que executou a acao (admin que
-- aprovou, usuario que pediu). role_caller evita join com profiles no log.

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  detail text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_user_idx
  on public.activity_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Esportes — catalogo
-- ---------------------------------------------------------------------------

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  league_id uuid references public.leagues (id) on delete set null,
  home_team_id uuid references public.teams (id) on delete restrict,
  away_team_id uuid references public.teams (id) on delete restrict,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'SUSPENDED', 'LIVE', 'FINISHED', 'CANCELED')),
  kickoff_at timestamptz not null,
  minute integer,
  home_score integer not null default 0,
  away_score integer not null default 0,
  margin numeric(5,4) not null default 1.0500,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_distinct_teams check (home_team_id is distinct from away_team_id)
);

create index if not exists matches_status_kickoff_idx on public.matches (status, kickoff_at);
create index if not exists matches_league_idx on public.matches (league_id);

create table if not exists public.match_markets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  name text not null,
  category text not null default 'main',
  created_at timestamptz not null default now()
);

create index if not exists match_markets_match_idx on public.match_markets (match_id);

create table if not exists public.market_choices (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.match_markets (id) on delete cascade,
  label text not null,
  odds numeric(8,2) not null check (odds > 1),
  previous_odds numeric(8,2),
  trend text not null default 'stable' check (trend in ('up', 'down', 'stable')),
  is_suspended boolean not null default false,
  sort_order smallint not null default 0
);

create index if not exists market_choices_market_idx on public.market_choices (market_id);

-- ---------------------------------------------------------------------------
-- bets — apostas do PrimasBet
--
-- Tabela nova (nao existe no outro produto). user_id referencia auth.users,
-- igual wallet_balances/financial_ledger usam. status/type seguem o padrao do
-- banco real: text + check (sem enums em public).
--
-- selection e a copia fiel no momento da aceitacao; a odd gravada e a odd
-- travada, se a cotacao mexer depois a aposta nao muda.
-- ---------------------------------------------------------------------------

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('single', 'multiple')),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'WON', 'LOST', 'CASHED_OUT', 'VOID')),
  selections jsonb not null,
  total_odds numeric(10,2) not null check (total_odds > 1),
  stake numeric(12,2) not null check (stake > 0),
  potential_return numeric(12,2) not null check (potential_return > 0),
  actual_return numeric(12,2),
  cashout_value numeric(12,2),
  election_contest_id uuid,
  placed_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists bets_user_placed_idx on public.bets (user_id, placed_at desc);
create index if not exists bets_status_idx on public.bets (status);

-- ---------------------------------------------------------------------------
-- RLS das tabelas novas
--
-- As tabelas de dinheiro do banco real ja tinham RLS e policies; aqui so se
-- mexe nas criadas nesta migration. Leitura publica para o catalogo (a vitrine
-- e o produto), leitura propria para bets, admin para logs e settings e de
-- leitura exclusiva de app via RPC/Edge Function (service_role ignora RLS).
-- ---------------------------------------------------------------------------

alter table public.leagues enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.match_markets enable row level security;
alter table public.market_choices enable row level security;
alter table public.bets enable row level security;
alter table public.system_settings enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "leagues sao publicas para leitura" on public.leagues;
create policy "leagues sao publicas para leitura" on public.leagues
  for select to anon, authenticated using (true);

drop policy if exists "teams sao publicos para leitura" on public.teams;
create policy "teams sao publicos para leitura" on public.teams
  for select to anon, authenticated using (true);

drop policy if exists "matches sao publicas para leitura" on public.matches;
create policy "matches sao publicas para leitura" on public.matches
  for select to anon, authenticated using (true);

drop policy if exists "match_markets sao publicos para leitura" on public.match_markets;
create policy "match_markets sao publicos para leitura" on public.match_markets
  for select to anon, authenticated using (true);

drop policy if exists "market_choices sao publicos para leitura" on public.market_choices;
create policy "market_choices sao publicos para leitura" on public.market_choices
  for select to anon, authenticated using (true);

drop policy if exists "usuario le as proprias apostas" on public.bets;
create policy "usuario le as proprias apostas" on public.bets
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "admin le todas as apostas" on public.bets;
create policy "admin le todas as apostas" on public.bets
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role in ('admin', 'super_admin')));

drop policy if exists "settings sao de leitura publica" on public.system_settings;
create policy "settings sao de leitura publica" on public.system_settings
  for select to authenticated using (true);

drop policy if exists "admin le os logs" on public.activity_logs;
create policy "admin le os logs" on public.activity_logs
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role in ('admin', 'super_admin')));

-- ---------------------------------------------------------------------------
-- Permissoes de tabela
-- ---------------------------------------------------------------------------
-- O banco real ja concede a roles aon/authenticated/service_role (378 grants).
-- Aqui so asseguramos as tabelas novas criadas por esta migration.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.leagues to anon, authenticated, service_role;
grant select on public.teams to anon, authenticated, service_role;
grant select on public.matches to anon, authenticated, service_role;
grant select on public.match_markets to anon, authenticated, service_role;
grant select on public.market_choices to anon, authenticated, service_role;
grant select on public.bets to authenticated, service_role;
grant select on public.system_settings to authenticated, service_role;
grant select on public.activity_logs to authenticated, service_role;
grant all on public.bets to service_role;
grant all on public.system_settings to service_role;
grant all on public.activity_logs to service_role;