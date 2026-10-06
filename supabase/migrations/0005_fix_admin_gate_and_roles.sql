-- PrimasBet — corrige o gate de administrador e adiciona gestao de perfil
--
-- BUG: a Edge Function chama as RPC com service_role. Dentro das funcoes
-- security definer, `auth.uid()` e NULL para o JWT de service_role, entao
-- `public.is_admin()` (que le auth.uid()) sempre retornava false e TODA acao
-- do painel falhava com 'Acesso restrito a administradores ativos'.
--
-- Corrige: o gate passa a validar o reviewer recebido (p_reviewer_id), que a
-- Edge Function ja conferiu contra profiles antes de chamar a RPC. Segue o
-- mesmo padrao de set_election_candidate_odd_atomic (p_changed_by).

-- ---------------------------------------------------------------------------
-- Helper: valida reviewer ativo admin/super_admin
-- ---------------------------------------------------------------------------

create or replace function public.is_admin_reviewer(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_uid is not null
    and exists (
      select 1 from public.profiles
      where user_id = p_uid
        and role in ('admin', 'super_admin')
        and status = 'active'
    );
$$;

grant execute on function public.is_admin_reviewer(uuid) to service_role;

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
  if not public.is_admin_reviewer(coalesce(p_reviewer_id, auth.uid())) then
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
-- Deposito: aprovacao / rejeicao
-- ---------------------------------------------------------------------------

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
  if not public.is_admin_reviewer(coalesce(p_reviewer_id, auth.uid())) then
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
  if not public.is_admin_reviewer(coalesce(p_reviewer_id, auth.uid())) then
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
-- Saque: aprovacao / rejeicao
-- ---------------------------------------------------------------------------

create or replace function public.approve_withdrawal_atomic(
  p_request_id uuid,
  p_reviewer_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.is_admin_reviewer(coalesce(p_reviewer_id, auth.uid())) then
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
  if not public.is_admin_reviewer(coalesce(p_reviewer_id, auth.uid())) then
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
-- Status de conta (admin) + papel (admin)
-- ---------------------------------------------------------------------------

create or replace function public.set_user_status(
  p_user_id uuid,
  p_status text,
  p_reviewer_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.is_admin_reviewer(coalesce(p_reviewer_id, auth.uid())) then
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

create or replace function public.set_user_role(
  p_user_id uuid,
  p_role text,
  p_reviewer_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if not public.is_admin_reviewer(coalesce(p_reviewer_id, auth.uid())) then
    raise exception 'Acesso restrito a administradores ativos';
  end if;

  v_role := lower(p_role);
  if v_role not in ('user', 'admin') then
    raise exception 'Perfil invalido';
  end if;

  if coalesce(p_reviewer_id, auth.uid()) = p_user_id then
    raise exception 'Administrador nao pode rebaixar o proprio perfil';
  end if;

  update public.profiles
  set role = v_role,
      updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception 'Perfil nao encontrado';
  end if;

  perform public.log_action(coalesce(p_reviewer_id, auth.uid()),
    'set_user_role', p_user_id::text || ':' || v_role);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissoes: manter so service_role nas de admin; nova funcao idem
-- ---------------------------------------------------------------------------

revoke execute on function public.set_user_role(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.set_user_role(uuid, text, uuid) to service_role;