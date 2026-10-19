-- ---------------------------------------------------------------------------
-- 0016_fix_wallet_sync_trigger.sql
--
-- BUG: havia dois triggers em public.profiles que chamavam
-- sync_profile_to_wallet_balances() em INSERT **e a cada UPDATE** do perfil:
--
--   * sync_profile_balances          AFTER INSERT OR UPDATE OF available_balance, total_earned
--   * trigger_sync_profile_to_wallet AFTER INSERT OR UPDATE
--
-- A funcao copia profiles.available_balance -> wallet_balances.wallet_balance.
-- Como o saldo real hoje vive em wallet_balances (gerido por wallet_upsert e
-- creditado por approve_deposit_atomic), e available_balance e um campo legado
-- que fica em 0, QUALQUER update de perfi (login, KYC, edicao no backoffice)
-- zerava o saldo do usuario logo apos um deposito ser aprovado.
--
-- CORRECAO: remove os triggers de sincronizacao profiles -> wallet e deixa
-- apenas a criacao da carteira zerada no cadastro (INSERT). Dali em diante
-- wallet_balances e a unica fonte de verdade do saldo.
-- ---------------------------------------------------------------------------

create or replace function public.seed_wallet_on_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallet_balances (
    user_id, wallet_balance, yield_balance, bonus_balance, locked_balance
  ) values (
    NEW.user_id,
    coalesce(NEW.available_balance, 0),
    coalesce(NEW.total_earned, 0),
    0,
    0
  )
  on conflict (user_id) do nothing;
  return NEW;
end;
$$;

drop trigger if exists trigger_sync_profile_to_wallet on public.profiles;
drop trigger if exists sync_profile_balances on public.profiles;
drop trigger if exists seed_wallet_on_profile_insert on public.profiles;

create trigger seed_wallet_on_profile_insert
  after insert on public.profiles
  for each row execute function public.seed_wallet_on_profile_insert();

-- ---------------------------------------------------------------------------
-- Reparo: restaura wallet_balance a partir do ultimo snapshot do extrato
-- (financial_ledger.balance_after). O extrato nunca foi afetado pelo bug, entao
-- o ultimo balance_after por usuario e o saldo correto.
-- ---------------------------------------------------------------------------
with last_ledger as (
  select distinct on (user_id) user_id, balance_after
  from public.financial_ledger
  order by user_id, created_at desc
)
update public.wallet_balances wb
set wallet_balance = ll.balance_after,
    updated_at = now()
from last_ledger ll
where ll.user_id = wb.user_id
  and abs(wb.wallet_balance - ll.balance_after) > 0.001;
