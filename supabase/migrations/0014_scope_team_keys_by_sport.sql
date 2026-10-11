-- PrimasBet — chave de time isolada por esporte (corrige nomes cruzados)
--
-- A ESPN reaproveita ids numericos entre esportes: o id 2029 e o Palmeiras no
-- futebol e um time universitario no volei. Como teams.external_key guardava so
-- o id, o upsert por external_key sobrescrevia o nome de um clube pelo do time
-- de outro esporte — o Palmeiras do Brasileirao aparecia na tela como
-- "Arkansas-Pine Bluff Golden Lions" (placar e mercados corretos, so o nome
-- trocado). O feed passou a usar `<esporte>:<id>`; esta migracao alinha as
-- linhas ja gravadas antes de o prefixo existir.
--
-- O esporte de cada time e derivado das ligas das partidas que o referenciam.
-- Quando o time aparece em mais de um esporte (o proprio caso da colisao),
-- adota o esporte com mais partidas; a proxima passada do sync repoe o outro
-- esporte com a chave correta e reaponta as partidas correspondentes.

with usage as (
  select m.home_team_id as team_id, l.sport
    from public.matches m
    join public.leagues l on l.id = m.league_id
  union all
  select m.away_team_id as team_id, l.sport
    from public.matches m
    join public.leagues l on l.id = m.league_id
),
ranked as (
  select team_id, sport, count(*) as games
    from usage
   group by team_id, sport
),
picked as (
  select distinct on (team_id) team_id, sport
    from ranked
   order by team_id, games desc, sport
)
update public.teams t
   set external_key = p.sport || ':' || t.external_key
  from picked p
 where p.team_id = t.id
   and t.external_key is not null
   and t.external_key !~ ':';

-- Times sem partida ficaram sem prefixo (nao deram para derivar o esporte); o
-- sync seguinte os recria com a chave correta. Remove os orfaos para nao
-- acumular linhas mortas.
delete from public.teams t
 where t.external_key is not null
   and t.external_key !~ ':'
   and not exists (
     select 1 from public.matches m
      where m.home_team_id = t.id or m.away_team_id = t.id
   );
