-- ---------------------------------------------------------------------------
-- Aprovacao automatica SPI para depositos PIX de baixo valor + persistencia
-- dos dois toggles (bonus de boas-vindas e auto-aprovacao) em system_settings.
--
-- Antes: autoApproveSmallDeposits era um stub — nunca persistia (fetch duro
-- como false) e o banco nao tinha logica de aprovacao automatica. Resultado:
-- deposito pequeno ia para a fila manual e o bonus de boas-vindas nunca era
-- gerado (so nasce na aprovacao). Agora o PIX abaixo do limite e confirmado na
-- hora, credita a carteira e aplica o bonus de boas-vindas do primeiro
-- deposito, tudo dentro do request_deposit.
-- ---------------------------------------------------------------------------

-- Chaves default para os dois toggles
insert into public.system_settings (key, value)
select v.key, v.value
from (values
  ('auto_approve_small', 'false'),
  ('auto_approve_threshold', '100')
) as v(key, value)
where not exists (select 1 from public.system_settings s where s.key = v.key);

-- ---------------------------------------------------------------------------
-- Helpers de leitura de setting usados pelos toggles (ja existem, mas garante)
-- ---------------------------------------------------------------------------
create or replace function public.setting(p_key text, p_default numeric)
returns numeric language plpgsql stable set search_path = public as $$
declare v numeric;
begin
  select s.value::numeric into v
    from public.system_settings s where s.key = p_key;
  return coalesce(v, p_default);
end;
$$;

create or replace function public.setting_flag(p_key text, p_default boolean)
returns boolean language plpgsql stable set search_path = public as $$
declare v boolean;
begin
  select s.value::boolean into v
    from public.system_settings s where s.key = p_key;
  return coalesce(v, p_default);
end;
$$;

-- ---------------------------------------------------------------------------
-- Credito de deposito SEM check de admin, usado pela aprovacao automatica.
-- Espelha approve_deposit_atomic (bonus + ledger) menos a exigencia de admin.
-- ---------------------------------------------------------------------------
create or replace function public.approve_deposit_auto(
  p_request_id uuid
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

  -- Bonus calculado antes de confirmar: "primeiro deposito confirmado".
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
      admin_notes = coalesce(admin_notes, 'aprovado automaticamente (SPI)')
  where id = p_request_id;

  select public.wallet_upsert(v_user,
         p_wallet_delta => v_amount, p_locked_delta => -v_amount)
  into v_after;

  v_before := v_after - v_amount;

  insert into public.financial_ledger
    (user_id, type, amount, balance_before, balance_after, description, reference_id)
  values
    (v_user, 'deposit', v_amount, v_before, v_after,
     'Deposito aprovado automaticamente', p_request_id);

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

  perform public.log_action(coalesce(auth.uid(), v_user),
    'approve_deposit', p_request_id::text);

  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- request_deposit: apos travar o valor, confirma na hora PIX pequenos quando o
-- toggle de auto-aprovacao estiver ligado, gerando bonus de boas-vindas.
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

  -- Aprovacao automatica SPI: PIX abaixo do limite e confirmado na hora.
  if lower(coalesce(p_method, '')) = 'pix'
     and public.setting_flag('auto_approve_small', false)
     and p_amount <= public.setting('auto_approve_threshold', 100)
  then
    perform public.approve_deposit_auto(v_id);
  end if;

  return v_id;
end;
$$;

-- approve_deposit_auto e interno: so o request_deposit (e o service_role) chama.
revoke execute on function public.approve_deposit_auto(uuid) from public, anon, authenticated;
grant execute on function public.approve_deposit_auto(uuid) to service_role;