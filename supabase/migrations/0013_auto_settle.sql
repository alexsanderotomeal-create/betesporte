-- PrimasBet — liquidacao automatica de apostas esportivas
--
-- Um processo roda de tempos em tempos (cron na VPS e botao no painel) e chama
-- auto_settle_bets(), que varre apostas OPEN, compara cada selecao com o
-- resultado final da partida (home_score/away_score ja persistidos pelo sync)
-- e liquida reutilizando settle_bet_atomic — pagamento, extrato e log do
-- liquidar manual saem iguais:
--
--   * todas as selecoes ganhas      -> WON  (paga bets.potential_return)
--   * qualquer selecao perdida      -> LOST (stake ja debitada na colocacao)
--   * qualquer partida anulada      -> VOID (devolve a stake inteira, regra
--     simplificada: multipla NAO recalcula as pernas restantes)
--   * partida ainda nao concluida   -> mantem OPEN
--   * selecao/mercado que o parser nao julga -> mantem OPEN e entra na conta
--     'unresolved' para o admin revisar na mao
--   * apostas eleitorais            -> fora (nao ha partida/placar)
--
-- O reviewer: no painel vem do admin que clicou; no cron (sem usuario logado)
-- cai para o primeiro admin ativo. Sobe a mesma lista de retorno para a
-- interface informar o que foi liquidado, o que ficou aberto e o por que.

-- ---------------------------------------------------------------------------
-- Helper: julga uma selecao contra o resultado final da partida
-- ---------------------------------------------------------------------------

create or replace function public.resolve_selection_outcome(p_choice_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_status text;
  v_market text;
  v_label text;
  v_home_name text;
  v_away_name text;
  v_home_score integer;
  v_away_score integer;
  v_total numeric;
  v_line numeric;
begin
  select m.status, mk.name, mc.label, th.name, ta.name, m.home_score, m.away_score
    into v_status, v_market, v_label, v_home_name, v_away_name, v_home_score, v_away_score
  from public.market_choices mc
  join public.match_markets mk on mk.id = mc.market_id
  join public.matches m on m.id = mk.match_id
  left join public.teams th on th.id = m.home_team_id
  left join public.teams ta on ta.id = m.away_team_id
  where mc.id = p_choice_id;

  if not found then
    return 'UNRESOLVED';
  end if;

  if v_status = 'CANCELED' then
    return 'VOID';
  end if;
  if v_status <> 'FINISHED' then
    return 'PENDING';
  end if;

  v_label := trim(v_label);
  v_home_name := trim(coalesce(v_home_name, ''));
  v_away_name := trim(coalesce(v_away_name, ''));

  -- Mercado de vencedor simples: 1X2 e duelos de 2 lados. O rotulo exato e o
  -- nome do time como o sync gravou em market_choices.
  if v_market like 'Resultado Final%' or v_market like 'Vencedor%' then
    if v_label <> '' and v_label = v_home_name then
      return case when v_home_score > v_away_score then 'WON' else 'LOST' end;
    end if;
    if v_label <> '' and v_label = v_away_name then
      return case when v_away_score > v_home_score then 'WON' else 'LOST' end;
    end if;
    if v_label = 'Empate' then
      return case when v_home_score = v_away_score then 'WON' else 'LOST' end;
    end if;
    return 'UNRESOLVED';
  end if;

  -- Dupla Chance: 'TimeA ou Empate', 'TimeA ou TimeB', 'Empate ou TimeB'.
  if v_market like 'Dupla Chance%' then
    declare
      v_has_h boolean;
      v_has_a boolean;
      v_has_d boolean;
      v_winner text;
    begin
      v_has_h := v_home_name <> '' and v_label like '%' || v_home_name || '%';
      v_has_a := v_away_name <> '' and v_label like '%' || v_away_name || '%';
      v_has_d := v_label like '%Empate%';
      if not (v_has_h or v_has_a or v_has_d) then
        return 'UNRESOLVED';
      end if;

      v_winner := case
        when v_home_score > v_away_score then 'H'
        when v_away_score > v_home_score then 'A'
        else 'D'
      end;

      case v_winner
        when 'H' then return case when v_has_h then 'WON' else 'LOST' end;
        when 'A' then return case when v_has_a then 'WON' else 'LOST' end;
        else return case when v_has_d then 'WON' else 'LOST' end;
      end case;
    end;
  end if;

  -- Totais (gols/pontos): 'Mais de 2.5 Gols' / 'Menos de 225' / 'Menos de 225.5'.
  -- Linhas com .5 nunca empatam com placar inteiro; se igualar, empate (push).
  if v_market like 'Total de Gols%' or v_market like 'Total de Pontos%' then
    if v_label ~ '^Mais de ' then
      select (regexp_match(v_label, '^Mais de ([0-9]+(?:\.[0-9]+)?)'))[1]::numeric
        into v_line;
      if v_line is not null then
        v_total := v_home_score + v_away_score;
        return case
          when v_total > v_line then 'WON'
          when v_total = v_line then 'VOID'
          else 'LOST'
        end;
      end if;
    elsif v_label ~ '^Menos de ' then
      select (regexp_match(v_label, '^Menos de ([0-9]+(?:\.[0-9]+)?)'))[1]::numeric
        into v_line;
      if v_line is not null then
        v_total := v_home_score + v_away_score;
        return case
          when v_total < v_line then 'WON'
          when v_total = v_line then 'VOID'
          else 'LOST'
        end;
      end if;
    end if;
    return 'UNRESOLVED';
  end if;

  return 'UNRESOLVED';
end;
$$;

-- ---------------------------------------------------------------------------
-- Liquidacao em lote (cron + painel)
-- ---------------------------------------------------------------------------

create or replace function public.auto_settle_bets(
  p_reviewer_id uuid default null,
  p_limit integer default 250
)
returns table (
  settled_won integer,
  settled_lost integer,
  settled_void integer,
  skipped_pending integer,
  skipped_unresolved integer,
  skipped_election integer
)
language plpgsql security definer set search_path = public as $$
declare
  v_bet record;
  v_selection jsonb;
  v_outcome text;
  v_any_lost boolean;
  v_any_pending boolean;
  v_any_void boolean;
  v_all_won boolean;
  v_is_election boolean;
  v_reviewer uuid;
  v_status text;
  v_won integer := 0;
  v_lost integer := 0;
  v_void integer := 0;
  v_pending integer := 0;
  v_unresolved integer := 0;
  v_election integer := 0;
begin
  -- Uma execucao por vez: se outro cron/painel estiver rodando, sai sem tocar
  -- nada (mesmo padrao do sync-sports).
  if not public.try_acquire_sync_lock2('auto_settle', 300) then
    return query select 0, 0, 0, 0, 0, 0;
    return;
  end if;

  v_reviewer := coalesce(p_reviewer_id, (
    select user_id from public.profiles
    where role in ('admin', 'super_admin') and status = 'active'
    order by user_id
    limit 1
  ));

  for v_bet in
    select b.id, b.selections, b.potential_return
    from public.bets b
    where b.status = 'OPEN'
    order by b.placed_at
    limit p_limit
    for update of b skip locked
  loop
    v_any_lost := false;
    v_any_pending := false;
    v_any_void := false;
    v_all_won := true;
    v_is_election := false;

    for v_selection in select * from jsonb_array_elements(v_bet.selections)
    loop
      if v_selection->>'kind' = 'election' then
        v_is_election := true;
        exit;
      end if;

      v_outcome := public.resolve_selection_outcome(
        nullif(v_selection->>'choiceId', '')::uuid
      );

      case v_outcome
        when 'LOST' then v_any_lost := true; v_all_won := false;
        when 'VOID' then v_any_void := true; v_all_won := false;
        when 'WON' then null;
        else
          -- PENDING (partida rolando/nao concluida) e UNRESOLVED (parser nao
          -- reconheceu) mantem a aposta aberta.
          v_any_pending := true;
          v_all_won := false;
      end case;
    end loop;

    if v_is_election then
      v_election := v_election + 1;
      continue;
    end if;

    if v_reviewer is null then
      v_unresolved := v_unresolved + 1;
      continue;
    end if;

    if v_any_lost then
      v_status := 'LOST';
    elsif v_any_pending then
      v_pending := v_pending + 1;
      continue;
    elsif v_any_void then
      v_status := 'VOID';
    else
      v_status := 'WON';
    end if;

    begin
      perform public.settle_bet_atomic(
        v_bet.id,
        v_status,
        case when v_status = 'WON' then v_bet.potential_return else null end,
        v_reviewer
      );
    exception when others then
      -- Aposta pode ter sido liquidada no mesmo instante por outra via; sem o
      -- raise abaixo o admin nao saberia o motivo. Mantido no log do cron.
      raise notice 'auto_settle: aposta % nao liquidada: %', v_bet.id, sqlerrm;
      v_unresolved := v_unresolved + 1;
      continue;
    end;

    case v_status
      when 'WON' then v_won := v_won + 1;
      when 'LOST' then v_lost := v_lost + 1;
      when 'VOID' then v_void := v_void + 1;
    end case;
  end loop;

  perform public.release_sync_lock2('auto_settle');

  return query select v_won, v_lost, v_void, v_pending, v_unresolved, v_election;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissoes: so o servidor (service_role / cron como owner) liquida em lote
-- ---------------------------------------------------------------------------

revoke execute on function public.resolve_selection_outcome(uuid) from public, anon, authenticated;
revoke execute on function public.auto_settle_bets(uuid, integer) from public, anon, authenticated;
grant execute on function public.auto_settle_bets(uuid, integer) to service_role;