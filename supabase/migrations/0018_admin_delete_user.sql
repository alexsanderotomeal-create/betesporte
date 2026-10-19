-- ---------------------------------------------------------------------------
-- 0018_admin_delete_user.sql
--
-- Exclusao definitiva de conta pelo painel admin (remover usuarios de teste).
--
-- O schema real tem FKs espalhadas: algumas apontam para auth.users, outras
-- para public.profiles, e varias tabelas legadas (wallet_balances,
-- financial_ledger, bets, investments, transactions, network_relations...) tem
-- coluna user_id SEM foreign key. Excluir so o auth.users falharia em
-- user_network (NO ACTION) e deixaria linhas orfas nas tabelas sem FK.
--
-- A RPC admin_delete_user_atomic apaga tudo numa transacao:
--   1) solta profiles.referred_by de quem foi indicado pelo usuario;
--   2) apaga linhas de todas as tabelas public com user_id (guardado por
--      to_regclass, pois nem todas existem em todo ambiente);
--   3) trata colunas alternativas (network_relations.referred_id,
--      user_network.ancestor_id, commissions.source_user_id,
--      transfers.from_user_id/to_user_id);
--   4) apaga profiles (cascateia deposits/withdrawals/yields/commissions/...);
--   5) apaga auth.users (cascateia auth.* e demais FKs).
--
-- Gate: is_admin_reviewer + protecoes (nao excluir a si mesmo nem outro admin).
-- Escrita continua restrita ao service_role (a Edge Function chama com a chave
-- de servico). ---------------------------------------------------------------------------

create or replace function public.admin_delete_user_atomic(
  p_user_id uuid,
  p_reviewer_id uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reviewer uuid := coalesce(p_reviewer_id, auth.uid());
  v_table text;
  v_tables text[] := array[
    'activity_logs', 'financial_ledger', 'transactions', 'bets', 'investments',
    'yields', 'commissions', 'commission_history', 'deposits', 'withdrawals',
    'wallet_balances', 'user_wallets', 'user_settings', 'user_bank_accounts',
    'user_preferences', 'user_kyc', 'notifications', 'user_network',
    'network_relations'
  ];
begin
  if not public.is_admin_reviewer(v_reviewer) then
    raise exception 'Acesso restrito a administradores ativos';
  end if;

  if p_user_id = v_reviewer then
    raise exception 'Nao e possivel excluir a propria conta';
  end if;

  if exists (
    select 1 from public.profiles
    where user_id = p_user_id and role in ('admin', 'super_admin')
  ) then
    raise exception 'Nao e possivel excluir a conta de um administrador';
  end if;

  if not exists (select 1 from public.profiles where user_id = p_user_id)
     and not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Usuario nao encontrado';
  end if;

  -- Referencias que nao possuem ON DELETE CASCADE.
  update public.profiles set referred_by = null where referred_by = p_user_id;

  -- Tabelas public com coluna user_id. Comparacao via ::text porque algumas
  -- tabelas legadas guardam o id como text, outras como uuid.
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format('delete from public.%I where user_id::text = $1::text', v_table)
        using p_user_id;
    end if;
  end loop;

  -- Colunas alternativas que tambem guardam o usuario.
  if to_regclass('public.network_relations') is not null then
    execute 'delete from public.network_relations where referred_id::text = $1::text'
      using p_user_id;
  end if;

  if to_regclass('public.user_network') is not null then
    execute 'delete from public.user_network where ancestor_id::text = $1::text'
      using p_user_id;
  end if;

  if to_regclass('public.commissions') is not null then
    execute 'delete from public.commissions where source_user_id::text = $1::text'
      using p_user_id;
  end if;

  if to_regclass('public.transfers') is not null then
    execute 'delete from public.transfers where from_user_id::text = $1::text or to_user_id::text = $1::text'
      using p_user_id;
  end if;

  -- Cascateia deposits/withdrawals/yields/commissions/commission_history/
  -- user_settings/user_wallets.
  delete from public.profiles where user_id = p_user_id;

  -- Cascateia auth.* + user_bank_accounts/user_preferences/user_kyc/
  -- notifications.
  delete from auth.users where id = p_user_id;

  perform public.log_action(v_reviewer, 'admin_delete_user', p_user_id::text);
end;
$$;

revoke execute on function public.admin_delete_user_atomic(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_delete_user_atomic(uuid, uuid)
  to service_role;
