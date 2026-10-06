-- PrimasBet — mercados eleitorais
--
-- Escopo: presidente e governador. Os numeros sao cotacao da casa, nao
-- pesquisa; o historico de ajuste registra quem mexeu e quando.
--
-- Segue o padrao do banco real: sem enums, tudo text + check de constraint, e
-- identidade de usuario pela coluna user_id (auth.users), nao profiles.id.

-- ---------------------------------------------------------------------------
-- Contestas — uma aberta por escopo
-- ---------------------------------------------------------------------------

create table if not exists public.election_contests (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('PRESIDENT', 'GOVERNOR')),
  -- NULL so para presidente: a votacao e nacional.
  state_code text check (state_code is null or state_code ~ '^[A-Z]{2}$'),
  title text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'SUSPENDED', 'CLOSED')),
  updated_at timestamptz not null default now()
);

-- Um prototyping aberto por escopo.
create unique index if not exists election_contests_open_unique
  on public.election_contests (scope, coalesce(state_code, ''))
  where status = 'OPEN';

-- ---------------------------------------------------------------------------
-- Candidatos e cotacao
-- ---------------------------------------------------------------------------

create table if not exists public.election_candidates (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.election_contests (id) on delete cascade,
  name text not null,
  party text,
  odds numeric(8,2) not null check (odds > 1),
  previous_odds numeric(8,2),
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists election_candidates_contest_idx
  on public.election_candidates (contest_id, sort_order);

-- ---------------------------------------------------------------------------
-- Historico de ajuste de odd
-- ---------------------------------------------------------------------------

create table if not exists public.election_odds_history (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null
    references public.election_candidates (id) on delete cascade,
  odds numeric(8,2) not null,
  previous_odds numeric(8,2),
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists election_odds_history_candidate_idx
  on public.election_odds_history (candidate_id, changed_at desc);

-- Liga a aposta eleitoral ao prototyping (a coluna nasce na 0001, o FK aqui).
do $$ begin
  alter table public.bets
    add constraint bets_election_contest_fk
    foreign key (election_contest_id) references public.election_contests (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.election_contests enable row level security;
alter table public.election_candidates enable row level security;
alter table public.election_odds_history enable row level security;

drop policy if exists "contests sao publicos para leitura" on public.election_contests;
create policy "contests sao publicos para leitura"
  on public.election_contests for select to anon, authenticated using (true);

drop policy if exists "candidatos sao publicos para leitura" on public.election_candidates;
create policy "candidatos sao publicos para leitura"
  on public.election_candidates for select to anon, authenticated using (true);

drop policy if exists "admin le o historico de odds" on public.election_odds_history;
create policy "admin le o historico de odds"
  on public.election_odds_history for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );

grant usage on schema public to anon, authenticated, service_role;
grant select on public.election_contests to anon, authenticated, service_role;
grant select on public.election_candidates to anon, authenticated, service_role;
grant select on public.election_odds_history to authenticated, service_role;
grant all on public.election_contests to service_role;
grant all on public.election_candidates to service_role;
grant all on public.election_odds_history to service_role;

-- ---------------------------------------------------------------------------
-- Seed — prototyping de tela (placeholders)
-- ---------------------------------------------------------------------------

insert into public.election_contests (scope, state_code, title)
select v.scope, v.state_code, v.title
from (values
  ('PRESIDENT', null::text, 'Presidencia da Republica'),
  ('GOVERNOR', 'SP', 'Governo do Estado de Sao Paulo'),
  ('GOVERNOR', 'RJ', 'Governo do Estado do Rio de Janeiro'),
  ('GOVERNOR', 'MG', 'Governo do Estado de Minas Gerais'),
  ('GOVERNOR', 'BA', 'Governo do Estado da Bahia'),
  ('GOVERNOR', 'PR', 'Governo do Estado do Parana')
) as v(scope, state_code, title)
where not exists (
  select 1 from public.election_contests c
   where c.scope = v.scope
     and coalesce(c.state_code, '') = coalesce(v.state_code, '')
     and c.status = 'OPEN'
);

insert into public.election_candidates (contest_id, name, party, odds, sort_order)
select c.id, v.name, v.party, v.odds, v.sort_order
from public.election_contests c
join (values
  ('PRESIDENT', 'Candidato A', 'PJ', 2.80, 1),
  ('PRESIDENT', 'Candidato B', 'PM', 3.20, 2),
  ('PRESIDENT', 'Candidato C', 'PS', 5.50, 3),
  ('PRESIDENT', 'Candidato D', 'PL', 7.00, 4),
  ('PRESIDENT', 'Outros', 'Sem partido', 11.00, 99)
) as v(scope, name, party, odds, sort_order) on v.scope = c.scope
where c.scope = 'PRESIDENT'
  and not exists (
    select 1 from public.election_candidates x where x.contest_id = c.id
  );

insert into public.election_candidates (contest_id, name, party, odds, sort_order)
select c.id, v.name, v.party, v.odds, v.sort_order
from public.election_contests c
join (values
  ('SP', 'Candidato A', 'PJ', 2.60, 1),
  ('SP', 'Candidato B', 'PM', 3.10, 2),
  ('SP', 'Candidato C', 'PS', 4.50, 3),
  ('SP', 'Outros', 'Sem partido', 9.00, 99),
  ('RJ', 'Candidato A', 'PJ', 2.40, 1),
  ('RJ', 'Candidato B', 'PM', 3.60, 2),
  ('RJ', 'Candidato C', 'PT', 4.20, 3),
  ('RJ', 'Outros', 'Sem partido', 10.00, 99),
  ('MG', 'Candidato A', 'PJ', 2.90, 1),
  ('MG', 'Candidato B', 'MDB', 3.30, 2),
  ('MG', 'Candidato C', 'PSB', 5.10, 3),
  ('MG', 'Outros', 'Sem partido', 8.50, 99),
  ('BA', 'Candidato A', 'PT', 2.70, 1),
  ('BA', 'Candidato B', 'PCdoB', 3.80, 2),
  ('BA', 'Candidato C', 'PSD', 4.80, 3),
  ('BA', 'Outros', 'Sem partido', 12.00, 99),
  ('PR', 'Candidato A', 'PSD', 3.00, 1),
  ('PR', 'Candidato B', 'PL', 3.40, 2),
  ('PR', 'Candidato C', 'PDT', 4.40, 3),
  ('PR', 'Outros', 'Sem partido', 9.50, 99)
) as v(state_code, name, party, odds, sort_order) on v.state_code = c.state_code
where c.scope = 'GOVERNOR'
  and not exists (
    select 1 from public.election_candidates x where x.contest_id = c.id
  );

-- ---------------------------------------------------------------------------
-- place_election_bet_atomic — mesma regra do esportivo: odd vem do banco.
-- ---------------------------------------------------------------------------

create or replace function public.place_election_bet_atomic(
  p_contest_id uuid,
  p_candidate_id uuid,
  p_stake numeric
)
returns table (bet_id uuid, odds numeric, potential_return numeric, candidate_name text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_odds numeric;
  v_name text;
  v_status text;
  v_scope text;
  v_state_code text;
  v_return numeric;
  v_bet uuid;
  v_balance numeric;
  v_selection jsonb;
begin
  perform public.assert_active();

  if p_stake <= 0 then
    raise exception 'Valor invalido';
  end if;

  select c.odds, c.name, ct.status, ct.scope, ct.state_code
    into v_odds, v_name, v_status, v_scope, v_state_code
  from public.election_candidates c
  join public.election_contests ct on ct.id = c.contest_id
  where c.id = p_candidate_id
    and c.contest_id = p_contest_id
    and c.is_active;

  if not found then
    raise exception 'Candidato indisponivel';
  end if;

  if v_status <> 'OPEN' then
    raise exception 'Mercado eleitoral fechado';
  end if;

  if v_odds <= 1 then
    raise exception 'Odd invalida';
  end if;

  v_return := round(p_stake * v_odds, 2);

  v_selection := jsonb_build_object(
    'kind', 'election',
    'contestId', p_contest_id,
    'candidateId', p_candidate_id,
    'candidateName', v_name,
    'scope', v_scope,
    'stateCode', v_state_code
  );

  select public.debit_wallet(auth.uid(), p_stake) into v_balance;

  insert into public.bets (
    user_id, type, selections, total_odds, stake, potential_return, status, election_contest_id
  )
  values (auth.uid(), 'single', jsonb_build_array(v_selection), v_odds, p_stake, v_return, 'OPEN', p_contest_id)
  returning id into v_bet;

  insert into public.financial_ledger
    (user_id, type, amount, balance_before, balance_after, description, reference_id)
  values
    (auth.uid(), 'bet', -p_stake, v_balance + p_stake, v_balance,
     'Aposta eleitoral: ' || v_name, v_bet);

  return query select v_bet, v_odds, v_return, v_name;
end;
$$;

revoke execute on function public.place_election_bet_atomic(uuid, uuid, numeric)
  from public, anon;
grant execute on function public.place_election_bet_atomic(uuid, uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- set_election_candidate_odd_atomic — ajuste de odd pelo admin
-- ---------------------------------------------------------------------------

create or replace function public.set_election_candidate_odd_atomic(
  p_candidate_id uuid,
  p_odds numeric,
  p_changed_by uuid
)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  v_previous numeric;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = p_changed_by and role in ('admin', 'super_admin') and status = 'active'
  ) then
    raise exception 'Acesso restrito a administradores ativos';
  end if;

  if p_odds is null or p_odds <= 1 or p_odds > 1000 then
    raise exception 'Odd fora da faixa permitida';
  end if;

  select c.odds into v_previous
  from public.election_candidates c
  where c.id = p_candidate_id
  for update;

  if not found then
    raise exception 'Candidato nao encontrado';
  end if;

  if v_previous = p_odds then
    return v_previous;
  end if;

  update public.election_candidates
  set odds = p_odds,
      previous_odds = v_previous,
      updated_at = now()
  where id = p_candidate_id;

  insert into public.election_odds_history (candidate_id, odds, previous_odds, changed_by)
  values (p_candidate_id, p_odds, v_previous, p_changed_by);

  return p_odds;
end;
$$;

revoke execute on function public.set_election_candidate_odd_atomic(uuid, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.set_election_candidate_odd_atomic(uuid, numeric, uuid)
  to service_role;