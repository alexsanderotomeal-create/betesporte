-- PrimasBet — gestao de contas (admin + autoatendimento do usuario)
--
-- Tudo aqui e ADITIVO: o banco real (mmm_imperium) e compartilhado e nenhuma
-- tabela existente e recriada. So mexemos em `profiles`/`withdrawals` via RPC
-- (ja era assim). Identidade de todas as tabelas novas e auth.users(id), que e
-- o padrao do wallet_balances/financial_ledger/bets.
--
-- Tabelas novas:
--   user_bank_accounts  contas PIX/bancarias salvas pelo usuario (padrao unico)
--   user_preferences    limite diario de deposito + autoexclusao
--   user_kyc            verificacao de identidade (documento + revisao)
--   notifications       avisos ao usuario (deposito/saque/aposta)
--
-- RPCs:
--   user_set_default_bank_account  troca a conta padrao do proprio usuario
--   admin_update_user_atomic       edicao de conta pelo backoffice (service_role)
--   admin_debit_wallet_atomic      debito manual pelo backoffice (service_role)
--   admin_review_kyc_atomic        aprovacao/rejeicao de KYC (service_role)
--   create_notification            insere aviso (service_role, uso interno)
--   request_deposit                REESCRITA: passa a respeitar limite/autoexclusao
--
-- Storage: bucket privado 'kyc-documents' com pasta por usuario.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- user_bank_accounts — contas de saque salvas
-- ---------------------------------------------------------------------------

create table if not exists public.user_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text,
  method text not null default 'pix'
    check (method in ('pix', 'bank_transfer')),
  pix_key_type text
    check (pix_key_type is null or pix_key_type in ('cpf', 'email', 'phone', 'random', 'cnpj')),
  pix_key text,
  holder_name text,
  holder_document text,
  bank_name text,
  bank_agency text,
  bank_account text,
  account_type text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_bank_accounts_pix_needs_key
    check (method <> 'pix' or (pix_key is not null and length(trim(pix_key)) >= 3))
);

-- No maximo uma conta padrao por usuario.
create unique index if not exists user_bank_accounts_one_default_idx
  on public.user_bank_accounts (user_id) where is_default;

create index if not exists user_bank_accounts_user_idx
  on public.user_bank_accounts (user_id, is_default desc, created_at desc);

alter table public.user_bank_accounts enable row level security;

drop policy if exists "usuario gerencia as proprias contas" on public.user_bank_accounts;
create policy "usuario gerencia as proprias contas" on public.user_bank_accounts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "admin le todas as contas bancarias" on public.user_bank_accounts;
create policy "admin le todas as contas bancarias" on public.user_bank_accounts
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

grant select, insert, update, delete on public.user_bank_accounts to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- user_preferences — limite diario de deposito + autoexclusao
-- ---------------------------------------------------------------------------

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily_deposit_limit numeric(12,2)
    check (daily_deposit_limit is null or daily_deposit_limit >= 0),
  self_exclusion_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "usuario gerencia as proprias preferencias" on public.user_preferences;
create policy "usuario gerencia as proprias preferencias" on public.user_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "admin le todas as preferencias" on public.user_preferences;
create policy "admin le todas as preferencias" on public.user_preferences
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

grant select, insert, update on public.user_preferences to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- user_kyc — verificacao de identidade
-- ---------------------------------------------------------------------------

create table if not exists public.user_kyc (
  user_id uuid primary key references auth.users (id) on delete cascade,
  document_type text,
  document_number text,
  document_url text,
  selfie_url text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  notes text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz
);

alter table public.user_kyc enable row level security;

-- O usuario so insere/le a propria linha; a revisao (status) e do backoffice.
drop policy if exists "usuario le o proprio kyc" on public.user_kyc;
create policy "usuario le o proprio kyc" on public.user_kyc
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "usuario envia o proprio kyc" on public.user_kyc;
create policy "usuario envia o proprio kyc" on public.user_kyc
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "usuario reenvia o proprio kyc" on public.user_kyc;
create policy "usuario reenvia o proprio kyc" on public.user_kyc
  for update to authenticated
  using (user_id = auth.uid() and status <> 'approved')
  with check (user_id = auth.uid());

drop policy if exists "admin le todos os kyc" on public.user_kyc;
create policy "admin le todos os kyc" on public.user_kyc
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

grant select, insert, update on public.user_kyc to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- notifications — avisos ao usuario
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  message text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "usuario le as proprias notificacoes" on public.notifications;
create policy "usuario le as proprias notificacoes" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "usuario marca as proprias notificacoes" on public.notifications;
create policy "usuario marca as proprias notificacoes" on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "usuario apaga as proprias notificacoes" on public.notifications;
create policy "usuario apaga as proprias notificacoes" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

grant select, update, delete on public.notifications to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: troca de conta padrao (usuario)
-- ---------------------------------------------------------------------------

create or replace function public.user_set_default_bank_account(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sessao obrigatoria';
  end if;
  if not exists (
    select 1 from public.user_bank_accounts
    where id = p_id and user_id = auth.uid()
  ) then
    raise exception 'Conta nao encontrada';
  end if;

  update public.user_bank_accounts
  set is_default = false, updated_at = now()
  where user_id = auth.uid() and is_default and id <> p_id;

  update public.user_bank_accounts
  set is_default = true, updated_at = now()
  where id = p_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.user_set_default_bank_account(uuid) from public, anon;
grant execute on function public.user_set_default_bank_account(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: notificacao (service_role)
-- ---------------------------------------------------------------------------

create or replace function public.create_notification(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_message text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, title, message)
  values (p_user_id, coalesce(p_kind, 'info'), p_title, p_message);
exception when others then
  null;
end;
$$;

revoke execute on function public.create_notification(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_notification(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: edicao de conta pelo backoffice (service_role)
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_user_atomic(
  p_user_id uuid,
  p_fields jsonb,
  p_reviewer_id uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_full_name text;
  v_phone text;
  v_document text;
  v_status text;
  v_role text;
  v_verified boolean;
  v_kyc text;
begin
  if not public.is_admin_reviewer(coalesce(p_reviewer_id, auth.uid())) then
    raise exception 'Acesso restrito a administradores ativos';
  end if;

  if p_fields ? 'full_name' then
    v_full_name := nullif(trim(p_fields->>'full_name'), '');
    if v_full_name is null then
      raise exception 'Nome invalido';
    end if;
  end if;

  if p_fields ? 'phone' then
    v_phone := nullif(trim(p_fields->>'phone'), '');
  end if;

  if p_fields ? 'document_number' then
    v_document := nullif(trim(p_fields->>'document_number'), '');
  end if;

  if p_fields ? 'status' then
    v_status := lower(p_fields->>'status');
    if v_status not in ('active', 'inactive', 'suspended', 'banned') then
      raise exception 'Status invalido';
    end if;
  end if;

  if p_fields ? 'role' then
    v_role := lower(p_fields->>'role');
    if v_role not in ('user', 'admin', 'super_admin') then
      raise exception 'Perfil invalido';
    end if;
  end if;

  if p_fields ? 'is_verified' then
    v_verified := (p_fields->>'is_verified')::boolean;
  end if;

  if p_fields ? 'kyc_status' then
    v_kyc := lower(p_fields->>'kyc_status');
    if v_kyc not in ('pending', 'approved', 'rejected', 'none') then
      raise exception 'Status de KYC invalido';
    end if;
  end if;

  update public.profiles
  set full_name       = coalesce(v_full_name, full_name),
      phone           = case when p_fields ? 'phone' then v_phone else phone end,
      document_number = case when p_fields ? 'document_number' then v_document else document_number end,
      status          = coalesce(v_status, status),
      is_active       = case when v_status is null then is_active
                             when v_status = 'active' then true else false end,
      role            = coalesce(v_role, role),
      is_verified     = coalesce(v_verified, is_verified),
      kyc_status      = case when p_fields ? 'kyc_status'
                             then nullif(v_kyc, 'none') else kyc_status end,
      updated_at      = now()
  where user_id = p_user_id;

  if not found then
    raise exception 'Perfil nao encontrado';
  end if;

  perform public.log_action(coalesce(p_reviewer_id, auth.uid()),
    'admin_update_user', p_user_id::text || ': ' || p_fields::text);
end;
$$;

revoke execute on function public.admin_update_user_atomic(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_update_user_atomic(uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: debito manual pelo backoffice (service_role)
-- ---------------------------------------------------------------------------

create or replace function public.admin_debit_wallet_atomic(
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

  select public.debit_wallet(p_user_id, p_amount) into v_after;

  v_before := v_after + p_amount;

  insert into public.financial_ledger
    (user_id, type, amount, balance_before, balance_after, description)
  values
    (p_user_id, 'withdrawal', -p_amount, v_before, v_after,
     coalesce(p_description, 'Debito manual pelo administrador'));

  perform public.log_action(coalesce(p_reviewer_id, auth.uid()),
    'debit_wallet', 'debito de ' || p_amount::text || ' de ' || p_user_id::text);

  return v_after;
end;
$$;

revoke execute on function public.admin_debit_wallet_atomic(uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_debit_wallet_atomic(uuid, numeric, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: revisao de KYC (service_role)
-- ---------------------------------------------------------------------------

create or replace function public.admin_review_kyc_atomic(
  p_user_id uuid,
  p_status text,
  p_notes text default null,
  p_reviewer_id uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.is_admin_reviewer(coalesce(p_reviewer_id, auth.uid())) then
    raise exception 'Acesso restrito a administradores ativos';
  end if;

  v_status := lower(p_status);
  if v_status not in ('approved', 'rejected', 'pending') then
    raise exception 'Status invalido';
  end if;

  insert into public.user_kyc (user_id, status, notes, reviewed_by, reviewed_at, submitted_at)
  values (p_user_id, v_status, p_notes, coalesce(p_reviewer_id, auth.uid()), now(), now())
  on conflict (user_id) do update
    set status = v_status,
        notes = p_notes,
        reviewed_by = coalesce(p_reviewer_id, auth.uid()),
        reviewed_at = now();

  update public.profiles
  set kyc_status = v_status,
      is_verified = (v_status = 'approved'),
      updated_at = now()
  where user_id = p_user_id;

  perform public.log_action(coalesce(p_reviewer_id, auth.uid()),
    'review_kyc', p_user_id::text || ':' || v_status);
end;
$$;

revoke execute on function public.admin_review_kyc_atomic(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_review_kyc_atomic(uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- request_deposit REESCRITA: respeita limite diario e autoexclusao
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
  v_limit numeric;
  v_today numeric;
  v_excluded timestamptz;
begin
  perform public.assert_active();

  -- Autoexclusao: bloqueia qualquer novo deposito durante a janela.
  select self_exclusion_until into v_excluded
  from public.user_preferences where user_id = auth.uid();
  if v_excluded is not null and v_excluded > now() then
    raise exception 'Conta em autoexclusao ate %', to_char(v_excluded, 'DD/MM/YYYY HH24:MI');
  end if;

  v_min := public.setting('min_deposit', 20);
  if p_amount < v_min then
    raise exception 'Valor minimo de deposito e %', v_min;
  end if;

  -- Limite diario de deposito (soma do dia, desconsiderando rejeitados).
  select daily_deposit_limit into v_limit
  from public.user_preferences where user_id = auth.uid();
  if v_limit is not null then
    select coalesce(sum(amount), 0) into v_today
    from public.deposits
    where user_id = auth.uid()
      and status <> 'rejected'
      and created_at >= date_trunc('day', now());
    if v_today + p_amount > v_limit then
      raise exception 'Limite diario de deposito excedido (R$ %)', v_limit;
    end if;
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
  -- Preserva o comportamento da migration 0012 (bonus de boas-vindas inclusive).
  if lower(coalesce(p_method, '')) = 'pix'
     and public.setting_flag('auto_approve_small', false)
     and p_amount <= public.setting('auto_approve_threshold', 100)
  then
    perform public.approve_deposit_auto(v_id);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.request_deposit(numeric, text, text, text, text) from public, anon;
grant execute on function public.request_deposit(numeric, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: resumo de indicacao do proprio usuario
-- ---------------------------------------------------------------------------
-- RLS de profiles nao deixa o usuario ler os indicados; a contagem e feita
-- aqui, security definer, sem expor os dados dos outros.

create or replace function public.user_referral_summary()
returns table (referral_code text, referred_count bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Sessao obrigatoria';
  end if;

  select p.referral_code into v_code
  from public.profiles p where p.user_id = auth.uid();

  return query
    select v_code, coalesce(count(x.user_id), 0)
    from public.profiles x
    where v_code is not null and x.referred_by = v_code;
end;
$$;

revoke execute on function public.user_referral_summary() from public, anon;
grant execute on function public.user_referral_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado para documentos de KYC
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;

drop policy if exists "kyc upload propria pasta" on storage.objects;
create policy "kyc upload propria pasta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kyc leitura propria ou admin" on storage.objects;
create policy "kyc leitura propria ou admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role in ('admin', 'super_admin')
      )
    )
  );

drop policy if exists "kyc delete propria pasta" on storage.objects;
create policy "kyc delete propria pasta" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
