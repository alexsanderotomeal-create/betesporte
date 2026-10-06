-- Trava de sync com TIMEOUT e segura sob transaction-pooling do pgBouncer.
-- (Advisory locks de sessao nao funcionam: acquire/release caem em conexoes
--  pool diferentes e o lock vaza na conexao reutilizada.)

create table if not exists public.sports_sync_lock (
  key text primary key,
  acquired_at timestamptz not null
);

create or replace function public.try_acquire_sync_lock2(
  lock_key text default 'sports_sync',
  timeout_secs int default 180
) returns boolean language sql security definer set search_path = public as $$
  insert into public.sports_sync_lock as l (key, acquired_at)
  values (lock_key, now())
  on conflict (key) do update
    set acquired_at = excluded.acquired_at
    where l.acquired_at < now() - make_interval(secs => timeout_secs)
  returning true;
$$;

create or replace function public.release_sync_lock2(lock_key text default 'sports_sync')
returns void language sql security definer set search_path = public as $$
  delete from public.sports_sync_lock where key = lock_key;
$$;