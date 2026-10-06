-- PrimasBet (betespo) — migration 0006: dados reais
--
-- 1) Eleicoes: colunas de intencao de voto (percentual, fonte, data) e data da
--    eleicao; seed real do 2o turno 2026 (TSE): Flávio Bolsonaro x Lula + os
--    7 estados com 2o turno para governador.
-- 2) Esportes: external_key (identidade na API ESPN) em leagues/teams e coluna
--    sport em leagues — para a Edge Function sync-sports gravar partidas reais.
-- 3) Grants de escrita do catalogo esportivo para service_role (a RLS so
--    libera leitura; quem escreve e a Edge Function com chave de servico).

-- ---------------------------------------------------------------------------
-- Eleicoes: intencao de voto
-- ---------------------------------------------------------------------------

alter table public.election_candidates
  add column if not exists vote_intention numeric(6,2);

alter table public.election_candidates
  add column if not exists poll_source text;

alter table public.election_candidates
  add column if not exists poll_date date;

alter table public.election_contests
  add column if not exists election_date date;

-- ---------------------------------------------------------------------------
-- Esportes: identidade externa para sincronizacao
-- ---------------------------------------------------------------------------

alter table public.leagues
  add column if not exists external_key text;

alter table public.leagues
  add column if not exists sport text not null default 'football';

-- Index unique COMPLETO (sem WHERE): o ON CONFLICT do PostgREST so aceita
-- alvo de inferencia sem clausula parcial. NULLs continuam distintos.
create unique index if not exists leagues_external_key_unique
  on public.leagues (external_key);

alter table public.teams
  add column if not exists external_key text;

create unique index if not exists teams_external_key_unique
  on public.teams (external_key);

-- ---------------------------------------------------------------------------
-- Seed — 2o turno 2026 (dados reais)
--
-- Presidente: apuracao TSE 100% (04/10/2026): Flávio 47,03%, Lula 45,16%.
-- Governadores: os 7 estados com 2o turno em 25/10/2026 (fonte TSE / Agencia
-- Brasil). Intencao por estado fica nula: o operador preenche no painel.
-- ---------------------------------------------------------------------------

-- Remove candidatos placeholder da migration 0003.
delete from public.election_candidates
where name like 'Candidato %' or name = 'Outros';

-- Contests placeholder de 2o turno inexistente (SP, MG, BA, PR): sem 2o turno
-- de governador em 2026. O FK de bets usa on delete set null; historico de odd
-- e casteado via cascade. Este projeto nao tem aposta nesses placeholders.
delete from public.election_contests
where scope = 'GOVERNOR' and state_code in ('SP', 'MG', 'BA', 'PR');

-- Contest presidencial: titulo e data do 2o turno.
update public.election_contests
set title = 'Presidencia da Republica - 2o Turno 2026',
    election_date = '2026-10-25'
where scope = 'PRESIDENT' and state_code is null and status = 'OPEN';

-- Candidatos reais do 2o turno presidencial.
insert into public.election_candidates
  (contest_id, name, party, odds, vote_intention, poll_source, poll_date, sort_order)
select c.id, v.name, v.party, v.odds, v.intention, v.source, v.poll_date::date, v.sort_order
from public.election_contests c
cross join (values
  ('Flavio Bolsonaro', 'PL', 1.95, 47.03, 'TSE - 1o turno (100% apurado)', '2026-10-04', 1),
  ('Luiz Inacio Lula da Silva', 'PT', 1.85, 45.16, 'TSE - 1o turno (100% apurado)', '2026-10-04', 2)
) as v(name, party, odds, intention, source, poll_date, sort_order)
where c.scope = 'PRESIDENT' and c.status = 'OPEN'
  and not exists (
    select 1 from public.election_candidates x where x.contest_id = c.id
  );

-- Contests de governador com 2o turno.
insert into public.election_contests (scope, state_code, title, status, election_date)
select 'GOVERNOR', v.state_code, 'Governo do ' || v.state_name || ' - 2o Turno 2026', 'OPEN', '2026-10-25'
from (values
  ('AC', 'Acre'),
  ('AM', 'Amazonas'),
  ('DF', 'Distrito Federal'),
  ('ES', 'Espirito Santo'),
  ('RJ', 'Rio de Janeiro'),
  ('RN', 'Rio Grande do Norte'),
  ('TO', 'Tocantins')
) as v(state_code, state_name)
where not exists (
  select 1 from public.election_contests c
   where c.scope = 'GOVERNOR' and c.state_code = v.state_code and c.status = 'OPEN'
);

-- Candidatos reais dos 7 estados (2o turno).
insert into public.election_candidates
  (contest_id, name, party, odds, sort_order)
select c.id, v.name, v.party, v.odds, v.sort_order
from public.election_contests c
join (values
  ('AC', 'Mailza Assis', 'PP', 1.90, 1),
  ('AC', 'Alan Rick', 'Republicanos', 1.90, 2),
  ('AM', 'Omar Aziz', 'PSD', 1.85, 1),
  ('AM', 'Professora Maria do Carmo', 'PL', 1.95, 2),
  ('DF', 'Celina Leao', 'PP', 1.90, 1),
  ('DF', 'Leandro Grass', 'PT', 1.90, 2),
  ('ES', 'Lorenzo Pazolini', 'Republicanos', 1.90, 1),
  ('ES', 'Ricardo Ferraco', 'MDB', 1.90, 2),
  ('RJ', 'Douglas Ruas', 'PL', 1.75, 1),
  ('RJ', 'Eduardo Paes', 'PSD', 2.10, 2),
  ('RN', 'Allyson Bezerra', 'Uniao Brasil', 1.85, 1),
  ('RN', 'Cadu de Lula', 'PT', 1.95, 2),
  ('TO', 'Professora Dorinha', 'Uniao Brasil', 1.90, 1),
  ('TO', 'Vicentinho Junior', 'PSDB', 1.90, 2)
) as v(state_code, name, party, odds, sort_order) on v.state_code = c.state_code
where c.scope = 'GOVERNOR' and c.status = 'OPEN'
  and not exists (
    select 1 from public.election_candidates x where x.contest_id = c.id
  );

-- ---------------------------------------------------------------------------
-- Configuracao padrao do feed esportivo (editavel no painel)
-- ---------------------------------------------------------------------------

insert into public.system_settings (key, value)
select 'sports_feed_config',
'[{"sport":"football","slug":"bra.1","name":"Brasileirao Serie A","country":"Brasil"},{"sport":"football","slug":"eng.1","name":"Premier League","country":"Inglaterra"},{"sport":"football","slug":"esp.1","name":"La Liga","country":"Espanha"},{"sport":"football","slug":"ita.1","name":"Serie A Italiana","country":"Italia"},{"sport":"basketball","slug":"nba","name":"NBA","country":"Estados Unidos"}]'
where not exists (select 1 from public.system_settings s where s.key = 'sports_feed_config');

-- ---------------------------------------------------------------------------
-- Grants: a Edge Function sync-sports grava o catalogo com service_role.
-- ---------------------------------------------------------------------------

grant all on public.leagues to service_role;
grant all on public.teams to service_role;
grant all on public.matches to service_role;
grant all on public.match_markets to service_role;
grant all on public.market_choices to service_role;
grant all on public.election_contests to service_role;
grant all on public.election_candidates to service_role;