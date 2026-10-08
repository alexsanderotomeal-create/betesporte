-- 0011: feed de partidas reais ampliado (tenis, volei e MMA).
--
-- A ESPN ignora `dates` em tenis (devolve partidas antigas ja finalizadas);
-- a sync-sports descarta eventos fora da janela ontem+hoje antes de persistir.
-- Volei: a ESPN so publica as ligas universitarias EUA (feminina/masculina).
-- MMA: UFC e Bellator. E-sports: a ESPN nao fornece feed — fica de fora ate
-- haver provedor proprio (a sync so consome o scoreboard publico dela).
--
-- O JSON e identico ao DEFAULT_LEAGUES do codigo: manter os dois iguais faz o
-- deploy ser deterministico (a config do banco sempre sobrepoe o padrao).

insert into public.system_settings (key, value, updated_at)
values (
  'sports_feed_config',
  '[{"sport":"football","slug":"bra.1","name":"Brasileirao Serie A","country":"Brasil"},{"sport":"football","slug":"eng.1","name":"Premier League","country":"Inglaterra"},{"sport":"football","slug":"esp.1","name":"La Liga","country":"Espanha"},{"sport":"football","slug":"ita.1","name":"Serie A Italiana","country":"Italia"},{"sport":"football","slug":"ger.1","name":"Bundesliga","country":"Alemanha"},{"sport":"football","slug":"fra.1","name":"Ligue 1","country":"Franca"},{"sport":"football","slug":"por.1","name":"Liga Portugal","country":"Portugal"},{"sport":"football","slug":"ned.1","name":"Eredivisie","country":"Holanda"},{"sport":"football","slug":"uefa.champions","name":"Champions League","country":"Europa"},{"sport":"football","slug":"uefa.europa","name":"Europa League","country":"Europa"},{"sport":"basketball","slug":"nba","name":"NBA","country":"Estados Unidos"},{"sport":"tennis","slug":"atp","name":"ATP","country":"Mundo"},{"sport":"tennis","slug":"wta","name":"WTA","country":"Mundo"},{"sport":"mma","slug":"ufc","name":"UFC","country":"Mundo"},{"sport":"mma","slug":"bellator","name":"Bellator","country":"Mundo"},{"sport":"volleyball","slug":"womens-college-volleyball","name":"Volei Feminino NCAA","country":"EUA"},{"sport":"volleyball","slug":"mens-college-volleyball","name":"Volei Masculino NCAA","country":"EUA"}]',
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
