create or replace function public.sync_profile_to_wallet_balances()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.wallet_balances (
        user_id,
        wallet_balance,
        yield_balance,
        bonus_balance,
        locked_balance
    ) values (
        NEW.user_id,
        COALESCE(NEW.available_balance, 0),
        COALESCE(NEW.total_earned, 0),
        0,
        0
    )
    on conflict (user_id) do update set
        wallet_balance = excluded.wallet_balance,
        yield_balance = excluded.yield_balance,
        bonus_balance = wallet_balances.bonus_balance,
        locked_balance = wallet_balances.locked_balance,
        updated_at = now();

    return NEW;
end;
$$;