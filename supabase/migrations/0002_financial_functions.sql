-- PrimasBet — operacoes financeiras sobre o schema REAL (mmm_imperium)
--
-- Cada RPC e a unica forma de mexer em dinheiro. Todas sao security definer
-- com search_path fixo e validam o saldo pelo proprio UPDATE com condicao no
-- WHERE: dois updates simultaneos sobre o mesmo saldo nao vao para negativo,
-- porque o segundo nao casa com a linha.
--
-- Tabelas reais (colunas NOT NULL / checks):
--   deposits         id uuid, user_id FK profiles(user_id), amount numeric(15,2),
--                    method check(pix,credit_card,bank_transfer,usdt,crypto,transfer),
--                    status check(pending,confirmed,rejected,cancelled),
--                    transaction_hash UNIQUE, reference, proof_url, user_email,
--                    wallet_address, admin_account_id
--   withdrawals      id uuid, user_id FK profiles(user_id), amount numeric(20,8),
--                    method check(pix,bank_transfer,usdt,crypto,manual,transfer),
--                    destination_address NOT NULL,
--                    status check(pending,approved,rejected,processing,completed,cancelled),
--                    transaction_hash UNIQUE, processing_fee, confirmed_at
--   wallet_balances  user_id UNIQUE FK auth.users, wallet_balance/yield_balance/
--                    bonus_balance/locked_balance numeric(15,2) NOT NULL default 0
--   financial_ledger user_id FK auth.users, type check (11 tipos, incl.
--                    bet/bet_winnings/bet_refund adicionados na 0001), amount,
--                    balance_before, balance_after, reference_id uuid
--
-- Regras de vocabulario deste banco:
--   * pedido de deposito gravado com status 'confirmed' (nao 'approved'); o app
--     normaliza para a tela.
--   * financial_ledger.type minusculo: deposit, bonus, withdrawal, bet,
--     bet_winnings, bet_refund.
--   * wallet_balances nao tem linha para usuario novo (o handle_new_user do
--     banco real so cria o profile): todo update aqui e upsert.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role in ('admin', 'super_admin')
      and status = 'active'
  );
$$;

create or replace function public.assert_active()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sessao obrigatoria';
  end if;
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Conta bloqueada';
  end if;
end;
$$;

create or replace function public.setting(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.value::numeric from public.system_settings s
      where s.key = p_key limit 1),
    p_default
  );
$$;

create or replace function public.setting_flag(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.value::boolean from public.system_settings s
      where s.key = p_key limit 1),
    p_default
  );
$$;

create or replace function public.log_action(
  p_user_id uuid,
  p_action text,
  p_detail text default null,
  p_ip text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_logs (user_id, action, detail, ip_address)
  values (p_user_id, p_action, p_detail, p_ip);
exception when others then
  null;
end;
$$;

create or replace function public.wallet_upsert(
  p_user_id uuid,
  p_wallet_delta numeric default 0,
  p_locked_delta numeric default 0,
  p_bonus_delta numeric default 0,
  p_yield_delta numeric default 0
)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_after numeric;
begin
  insert into public.wallet_balances (user_id, wallet_balance, bonus_balance, locked_balance, yield_balance)
  values (
    p_user_id,
    greatest(p_wallet_delta, 0),
    greatest(p_bonus_delta, 0),
    greatest(p_locked_delta, 0),
    greatest(p_yield_delta, 0)
  )
  on conflict (user_id) do update set
    wallet_balance = greatest(wallet_balances.wallet_balance + p_wallet_delta, 0),
    bonus_balance  = greatest(wallet_balances.bonus_balance + p_bonus_delta, 0),
    locked_balance = greatest(wallet_balances.locked_balance + p_locked_delta, 0),
    yield_balance  = greatest(wallet_balances.yield_balance + p_yield_delta, 0),
    updated_at = now()
  returning wallet_balance into v_after;

  return v_after;
end;
$$;

-- Debito com guarda: so debita se houver saldo, em uma unica instrucao (o valor
-- no WHERE e a trava contra dois debitos simultaneos irem para negativo).
create or replace function public.debit_wallet(
  p_user_id uuid,
  p_amount numeric
)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_after numeric;
begin
  if p_amount <= 0 then
    raise exception 'Valor invalido';
  end if;

  update public.wallet_balances
  set wallet_balance = wallet_balance - p_amount,
      updated_at = now()
  where user_id = p_user_id
    and wallet_balance >= p_amount
  returning wallet_balance into v_after;

  if not found then
    -- Saldo insuficiente OU carteira ainda nao criada (cria so para debitar 0).
    if exists (select 1 from public.wallet_balances where user_id = p_user_id) then
      raise exception 'Saldo insuficiente';
    end if;
    insert into public.wallet_balances (user_id, wallet_balance)
    values (p_user_id, greatest(-p_amount, 0))
    returning wallet_balance into v_after;
    if v_after < 0 then
      raise exception 'Saldo insuficiente';
    end if;
  end if;

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- Credito manual (admin)
-- ---------------------------------------------------------------------------

create or replace function public.credit_wallet_atomic(
  p_user_id uuid,
  p_amount numeric,
  p_description text,
  p_reviewer_id uuid default null
)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_after numeric;
  v_before numeric;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores ativos';
  end if;
  if p_amount <= 0 then
    raise exception 'Valor invalido';
  end if;

  select public.wallet_upsert(p_user_id, p_wallet_delta => p_amount) into v_after;

  v_before := v_after - p_amount;

  insert into public.financial_ledger
    (user_id, type, amount, balance_before, balance_after, description)
  values
    (p_user_id, 'bonus', p_amount, v_before, v_after,
     coalesce(p_description, 'Credito manual'));

  perform public.log_action(coalesce(p_reviewer_id, auth.uid()),
    'credit_wallet', 'credito de ' || p_amount::text || ' para ' || p_user_id::text);

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deposito: pedido
--
-- O credito do saldo NAO acontece aqui — acontece na aprovacao. O valor sai do
-- saldo disponivel (vira locked_balance) quando o pedido entra, para o usuario
-- nao depositar e apostar o mesmo dinheiro.
-- ---------------------------------------------------------------------------

create or replace function public.request_deposit(
  p_amount numeric,
  p_method text default 'pix',
  p_txid text default null,
  p_reference text default null,
  p_wallet_address text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_min numeric;
  v_email text;
begin
  perform public.assert_active();

  v_min := public.setting('min_deposit', 20);
  if p_amount < v_min then
    raise exception 'Valor minimo de deposito e %', v_min;
  end if;

  if lower(coalesce(p_method, '')) not in ('pix', 'credit_card', 'bank_transfer', 'usdt', 'crypto', 'transfer') then
    raise exception 'Metodo de deposito invalido';
  end if;
  if p_txid is not null and length(trim(p_txid)) < 8 then
    raise exception 'Identificador da transacao invalido';
  end if;

  select email into v_email from public.profiles where user_id = auth.uid();

  insert into public.deposits
    (user_id, amount, method, status, transaction_hash, reference, proof_url,
     wallet_address, user_email)
  values
    (auth.uid(), p_amount, lower(p_method), 'pending',
     nullif(trim(coalesce(p_txid, '')), ''), p_reference, '',
     p_wallet_address, v_email)
  returning id into v_id;

  perform public.wallet_upsert(auth.uid(), p_locked_delta => p_amount);

  return v_id;
end;
$$;

create or replace function public.approve_deposit_atomic(
  p_request_id uuid,
  p_reviewer_id uuid
)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_user uuid;
  v_amount numeric;
  v_after numeric;
  v_before numeric;
  v_bonus numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores ativos';
  end if;

  select d.status, d.user_id, d.amount
    into v_status, v_user, v_amount
  from public.deposits d
  where d.id = p_request_id
  for update;

  if not found then
    raise exception 'Deposito nao encontrado';
  end if;
  if v_status <> 'pending' then
    raise exception 'Deposito ja esta %', v_status;
  end if;

  -- Bonus calculado ANTES de marcar como confirmado: o criterio e "nenhum
  -- deposito confirmado ate agora", senao o proprio pedido contaria.
  if public.setting_flag('welcome_bonus_enabled', true)
     and not exists (
       select 1 from public.deposits
        where user_id = v_user and status = 'confirmed' and id <> p_request_id
     )
  then
    v_bonus := round(v_amount * public.setting('welcome_bonus_percent', 100) / 100, 2);
  else
    v_bonus := 0;
  end if;

  update public.deposits
  set status = 'confirmed',
      confirmed_at = now(),
      admin_notes = coalesce(admin_notes, 'aprovado por ' || p_reviewer_id::text)
  where id = p_request_id;

  -- Deposito primeiro (sem o bonus) para o extrato mostrar o saldo real apos
  -- o credito; o bonus entra na linha seguinte.
  select public.wallet_upsert(v_user,
         p_wallet_delta => v_amount, p_locked_delta => -v_amount)
  into v_after;

  v_before := v_after - v_amount;

  insert into public.financial_ledger
    (user_id, type, amount, balance_before, balance_after, description, reference_id)
  values
    (v_user, 'deposit', v_amount, v_before, v_after,
     'Deposito aprovado', p_request_id);

  if v_bonus > 0 then
    declare
      v_after_bonus numeric;
    begin
      select public.wallet_upsert(v_user, p_bonus_delta => v_bonus) into v_after_bonus;

      insert into public.financial_ledger
        (user_id, type, amount, balance_before, balance_after, description, reference_id)
      values
        (v_user, 'bonus', v_bonus, v_after, v_after_bonus,
         'Bonus de boas-vindas sobre o primeiro deposito', p_request_id);
    end;
  end if;

  perform public.log_action(coalesce(p_reviewer_id, auth.uid()),
    'approve_deposit', p_request_id::text);

  return v_after;
end;
$$;

create or replace function public.reject_deposit_atomic(
  p_request_id uuid,
  p_reviewer_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_user uuid;
  v_amount numeric;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores ativos';
  end if;

  select d.status, d.user_id, d.amount
    into v_status, v_user, v_amount
  from public.deposits d
  where d.id = p_request_id
  for update;

  if not found then
    raise exception 'Deposito nao encontrado';
  end if;
  if v_status <> 'pending' then
    raise exception 'Deposito ja esta %', v_status;
  end if;

  update public.deposits
  set status = 'rejected',
      admin_notes = coalesce(admin_notes, 'rejeitado por ' || p_reviewer_id::text)
  where id = p_request_id;

  perform public.wallet_upsert(v_user, p_locked_delta => -v_amount);

  perform public.log_action(coalesce(p_reviewer_id, auth.uid()),
    'reject_deposit', p_request_id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Saque: pedido debita na hora
--
-- O valor sai do saldo quando o pedido entra, nao na aprovacao: liberar so na
-- aprovacao deixaria o usuario sacar o mesmo saldo varias vezes.
-- ---------------------------------------------------------------------------

create or replace function public.request_withdraw(
  p_amount numeric,
  p_method text default 'pix',
  p_destination text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_min numeric;
  v_after numeric;
  v_before numeric;
begin
  perform public.assert_active();

  v_min := public.setting('min_withdraw', 30);
  if p_amount < v_min then
    raise exception 'Valor minimo de saque e %', v_min;
  end if;

  if lower(coalesce(p_method, '')) not in ('pix', 'bank_transfer', 'usdt', 'crypto') then
    raise exception 'Metodo de saque invalido';
  end if;
  if p_destination is null or length(trim(p_destination)) < 3 then
    raise exception 'Destino do saque invalido';
  end if;

  select public.debit_wallet(auth.uid(), p_amount) into v_after;

  v_before := v_after + p_amount;

  insert into public.withdrawals
    (user_id, amount, method, destination_address, status)
  values
    (auth.uid(), p_amount, lower(p_method), trim(p_destination), 'pending')
  returning id into v_id;

  insert into public.financial_ledger
    (user_id, type, amount, balance_before, balance_after, description, reference_id)
  values
    (auth.uid(), 'withdrawal', -p_amount, v_before, v_after,
     'Pedido de saque', v_id);

  return v_id;
end;
$$;

create or replace function public.approve_withdrawal_atomic(
  p_request_id uuid,
  p_reviewer_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores ativos';
  end if;

  select w.status into v_status from public.withdrawals w
  where w.id = p_request_id for update;

  if not found then
    raise exception 'Saque nao encontrado';
  end if;
  if v_status <> 'pending' then
    raise exception 'Saque ja esta %', v_status;
  end if;

  update public.withdrawals
  set status = 'approved', confirmed_at = now()
  where id = p_request_id;

  perform public.log_action(coalesce(p_reviewer_id, auth.uid()),
    'approve_withdraw', p_request_id::text);
end;
$$;

create or replace function public.reject_withdrawal_atomic(
  p_request_id uuid,
  p_reviewer_id uuid
)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_user uuid;
  v_amount numeric;
  v_after numeric;
  v_before numeric;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores ativos';
  end if;

  select w.status, w.user_id, w.amount
    into v_status, v_user, v_amount
  from public.withdrawals w
  where w.id = p_request_id
  for update;

  if not found then
    raise exception 'Saque nao encontrado';
  end if;
  if v_status <> 'pending' then
    raise exception 'Saque ja esta %', v_status;
  end if;

  update public.withdrawals set status = 'rejected' where id = p_request_id;

  select public.wallet_upsert(v_user, p_wallet_delta => v_amount) into v_after;

  v_before := v_after - v_amount;

  insert into public.financial_ledger
    (user_id, type, amount, balance_before, balance_after, description, reference_id)
  values
    (v_user, 'withdrawal', v_amount, v_before, v_after,
     'Saque recusado — valor estornado', p_request_id);

  perform public.log_action(coalesce(p_reviewer_id, auth.uid()),
    'reject_withdraw', p_request_id::text);

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status de conta (admin)
-- ---------------------------------------------------------------------------
-- profiles.status do banco real aceita active/inactive/suspended/banned. O app
-- usa 'blocked': aqui a RPC mapeia 'blocked' -> 'suspended' para caber no check.

create or replace function public.set_user_status(
  p_user_id uuid,
  p_status text,
  p_reviewer_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores ativos';
  end if;

  v_status := case
    when p_status = 'blocked' then 'suspended'
    else lower(p_status)
  end;

  if v_status not in ('active', 'inactive', 'suspended', 'banned') then
    raise exception 'Status invalido';
  end if;

  update public.profiles
  set status = v_status,
      is_active = case when v_status = 'active' then true else false end,
      updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception 'Perfil nao encontrado';
  end if;

  perform public.log_action(coalesce(p_reviewer_id, auth.uid()),
    'set_user_status', p_user_id::text || ':' || v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Apostas esportivas — place_bet_atomic
--
-- A odd NUNCA vem do cliente: e lida de market_choices dentro da transacao.
-- Cada selecao e validada (mercado suspenso, partida fechada, id trocado) e
-- a aposta inteira cai se alguma delas estiver fora.
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

  v_return := round(p_stake * v_total, 2);

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
-- Liquidacao de aposta (admin / operacao)
-- ---------------------------------------------------------------------------

create or replace function public.settle_bet_atomic(
  p_bet_id uuid,
  p_status text,
  p_return numeric
)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_stake numeric;
  v_old text;
  v_after numeric;
  v_before numeric;
begin
  if not public.is_admin() then
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

  if p_status = 'WON' or p_status = 'VOID' then
    if p_return is null or p_return <= 0 then
      raise exception 'Valor de liquidacao invalido';
    end if;
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

    perform public.log_action(auth.uid(), 'settle_bet',
      p_bet_id::text || ':' || p_status);
    return v_after;
  end if;

  -- Perdeu: o stake ja foi debitado na colocacao; so rotula a lancada.
  update public.financial_ledger
  set description = 'Aposta perdida'
  where reference_id = p_bet_id;

  perform public.log_action(auth.uid(), 'settle_bet', p_bet_id::text || ':' || p_status);

  select wallet_balance into v_after from public.wallet_balances where user_id = v_user;
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissoes
--
-- Sem isto, qualquer papel com EXECUTE padrao chamaria as RPC de admin direto
-- e criaria dinheiro. Só service_role executa as de admin; authenticated usa
-- as de pedido. Anon e bloqueado sempre.
-- ---------------------------------------------------------------------------

revoke execute on function public.credit_wallet_atomic(uuid, numeric, text, uuid) from public, anon, authenticated;
revoke execute on function public.approve_deposit_atomic(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reject_deposit_atomic(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.approve_withdrawal_atomic(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reject_withdrawal_atomic(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.settle_bet_atomic(uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.set_user_status(uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.credit_wallet_atomic(uuid, numeric, text, uuid) to service_role;
grant execute on function public.approve_deposit_atomic(uuid, uuid) to service_role;
grant execute on function public.reject_deposit_atomic(uuid, uuid) to service_role;
grant execute on function public.approve_withdrawal_atomic(uuid, uuid) to service_role;
grant execute on function public.reject_withdrawal_atomic(uuid, uuid) to service_role;
grant execute on function public.settle_bet_atomic(uuid, text, numeric) to service_role;
grant execute on function public.set_user_status(uuid, text, uuid) to service_role;

revoke execute on function public.request_deposit(numeric, text, text, text, text) from public, anon;
revoke execute on function public.request_withdraw(numeric, text, text) from public, anon;
revoke execute on function public.place_bet_atomic(text, jsonb, numeric) from public, anon;

grant execute on function public.request_deposit(numeric, text, text, text, text) to authenticated;
grant execute on function public.request_withdraw(numeric, text, text) to authenticated;
grant execute on function public.place_bet_atomic(text, jsonb, numeric) to authenticated;

grant execute on function public.is_admin() to authenticated, service_role;
revoke execute on function public.log_action(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.wallet_upsert(uuid, numeric, numeric, numeric, numeric) from public, anon, authenticated;