-- Trava de reentrancia para sync-sports: advisory locks no Postgres.

create or replace function public.try_acquire_sync_lock(lock_key text) returns boolean
language sql security definer set search_path = public as
'select pg_try_advisory_lock(pg_catalog.hashtext(lock_key)::bigint);';

create or replace function public.release_sync_lock(lock_key text) returns void
language sql security definer set search_path = public as
'select pg_advisory_unlock(pg_catalog.hashtext(lock_key)::bigint);';