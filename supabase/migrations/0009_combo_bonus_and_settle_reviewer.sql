-- PrimasBet — bonus de multipla real e liquidacao pelo painel
--
-- 1) O boletim promete "Bonus Multipla" (5/10/15/25% para 2/3/4/5+ selecoes),
--    mas place_bet_atomic pagava so stake * odds: a tela mostrava um retorno
--    que o banco nunca ia creditar. A escada passa a morar aqui, e
--    bets.potential_return ja nasce com o bonus — na liquidacao o admin paga
--    exatamente o que o usuario viu.
--
-- 2) Aposta com mais de uma selecao e combo na pratica: as odds sempre sao
--    multiplicadas. O tipo e normalizado para 'multiple' para o dado nao
--    registrar 'single' quando um cliente antigo manda N selecoes.
--
-- 3) settle_bet_atomic ganha p_reviewer_id, igual as demais RPC financeiras
--    desde a 0005: a Edge Function admin-actions roda com service_role, onde
--    auth.uid() e NULL e o gate antigo (is_admin()) barrava Toda liquidacao.
--    A autorizacao continua no servidor — o reviewer e conferido contra
--    profiles na Edge Function antes da chamada e de novo na RPC.

-- ---------------------------------------------------------------------------
-- Bonus + tipo coerente
-- ---------------------------------------------------------------------------

create or replace function public.place_bet_atomic(
  p_type text,
  p_selections jsonb,
  p_stake numeric
)
returns table (bet_id uuid, total_odds numeric, potential_return numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_selection jsonb;
  v_choice uuid;
  v_market_id uuid;
  v_market uuid;
  v_match_status text;
  v_suspended boolean;
  v_odds numeric;
  v_total numeric := 1;
  v_return numeric;
  v_bet uuid;
  v_after numeric;
  v_before numeric;
  v_count integer := 0;
  v_bonus_pct integer := 0;
begin
  perform public.assert_active();

  if p_type not in ('single', 'multiple') then
    raise exception 'Tipo de aposta invalido';
  end if;
  if p_stake <= 0 then
    raise exception 'Valor invalido';
  end if;

  if p_selections is null or jsonb_typeof(p_selections) <> 'array'
     or jsonb_array_length(p_selections) = 0 then
    raise exception 'Aposta sem selecoes';
  end if;

  if jsonb_array_length(p_selections) > 20 then
    raise exception 'Aposta acima do limite de selecoes';
  end if;

  for v_selection in select * from jsonb_array_elements(p_selections)
  loop
    v_choice := (v_selection->>'choiceId')::uuid;
    v_market_id := nullif(v_selection->>'marketId', '')::uuid;

    if v_choice is null then
      raise exception 'Selecao sem identificador';
    end if;

    select mc.odds, mc.is_suspended, mk.id, m.status
      into v_odds, v_suspended, v_market, v_match_status
    from public.market_choices mc
    join public.match_markets mk on mk.id = mc.market_id
    join public.matches m on m.id = mk.match_id
    where mc.id = v_choice;

    if not found then
      raise exception 'Selecao inexistente';
    end if;

    if v_market_id is not null and v_market_id <> v_market then
      raise exception 'Selecao nao pertence ao mercado informado';
    end if;

    if v_suspended then
      raise exception 'Mercado suspenso';
    end if;

    if v_match_status <> 'OPEN' then
      raise exception 'Partida nao esta aberta';
    end if;

    if v_odds <= 1 then
      raise exception 'Odd invalida';
    end if;

    v_total := v_total * v_odds;
    v_count := v_count + 1;
  end loop;

  -- Uma selecao ja e simples; com mais de uma as odds sao multiplicadas, entao
  -- o registro vira 'multiple' — o que a tela promete e o que o dado mostra.
  if v_count > 1 then
    p_type := 'multiple';
    v_bonus_pct := case
      when v_count = 2 then 5
      when v_count = 3 then 10
      when v_count = 4 then 15
      else 25
    end;
  end if;

  v_return := round(p_stake * v_total * (100 + v_bonus_pct) / 100, 2);

  select public.debit_wallet(auth.uid(), p_stake) into v_after;

  v_before := v_after + p_stake;

  insert into public.bets (user_id, type, selections, total_odds, stake, potential_return, status)
  values (auth.uid(), p_type, p_selections, round(v_total, 4), p_stake, v_return, 'OPEN')
  returning id into v_bet;

  insert into public.financial_ledger
    (user_id, type, amount, balance_before, balance_after, description, reference_id)
  values
    (auth.uid(), 'bet', -p_stake, v_before, v_after,
     'Aposta registrada (' || v_count || ' selecoes)', v_bet);

  return query select v_bet, round(v_total, 4), v_return;
end;
$$;

-- ---------------------------------------------------------------------------
-- Liquidacao: reviewer conferido (padrao das RPC financeiras)
-- ---------------------------------------------------------------------------

drop function if exists public.settle_bet_atomic(uuid, text, numeric);

create or replace function public.settle_bet_atomic(
  p_bet_id uuid,
  p_status text,
  p_return numeric,
  p_reviewer_id uuid default null
)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_stake numeric;
  v_old text;
  v_after numeric;
  v_before numeric;
  v_reviewer uuid := coalesce(p_reviewer_id, auth.uid());
begin
  if not public.is_admin_reviewer(v_reviewer) then
    raise exception 'Acesso restrito a administradores ativos';
  end if;
  if p_status not in ('WON', 'LOST', 'CASHED_OUT', 'VOID') then
    raise exception 'Status de liquidacao invalido';
  end if;

  select b.user_id, b.stake, b.status into v_user, v_stake, v_old
  from public.bets b where b.id = p_bet_id for update;

  if not found then
    raise exception 'Aposta nao encontrada';
  end if;

  -- liquidar duas vezes pagaria duas vezes.
  if v_old <> 'OPEN' then
    raise exception 'Aposta ja esta %', v_old;
  end if;

  if p_status = 'WON' then
    if p_return is null or p_return <= 0 then
      raise exception 'Valor de liquidacao invalido';
    end if;
  elsif p_status = 'VOID' then
    -- Anulacao devolve a stake apostada, nem mais nem menos: nao e escolha do
    -- cliente nem do operador, entao o parametro e ignorado.
    p_return := v_stake;
  else
    p_return := 0;
  end if;

  update public.bets
  set status = p_status,
      actual_return = p_return,
      settled_at = now()
  where id = p_bet_id;

  if p_return > 0 then
    select public.wallet_upsert(v_user, p_wallet_delta => p_return) into v_after;

    v_before := v_after - p_return;

    insert into public.financial_ledger
      (user_id, type, amount, balance_before, balance_after, description, reference_id)
    values
      (v_user,
       case when p_status = 'VOID' then 'bet_refund' else 'bet_winnings' end,
       p_return, v_before, v_after, 'Aposta ' || p_status, p_bet_id);

    perform public.log_action(v_reviewer, 'settle_bet',
      p_bet_id::text || ':' || p_status);
    return v_after;
  end if;

  -- Perdeu: o stake ja foi debitado na colocacao; so rotula a lancada.
  update public.financial_ledger
  set description = 'Aposta perdida'
  where reference_id = p_bet_id;

  perform public.log_action(v_reviewer, 'settle_bet', p_bet_id::text || ':' || p_status);

  select wallet_balance into v_after from public.wallet_balances where user_id = v_user;
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissoes da assinatura nova: so a Edge Function (service_role) liquida,
-- tal como antes. authenticated continua de fora — a venda e no servidor.
-- ---------------------------------------------------------------------------

revoke execute on function public.settle_bet_atomic(uuid, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.settle_bet_atomic(uuid, text, numeric, uuid) to service_role;
