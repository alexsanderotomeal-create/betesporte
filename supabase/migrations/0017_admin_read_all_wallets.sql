-- ---------------------------------------------------------------------------
-- 0017_admin_read_all_wallets.sql
--
-- A gestao de contas (painel admin) lista todos os usuarios via
-- fetchAllProfiles(), que le profiles e wallet_balances no cliente.
-- profiles ja e legivel por todos, mas wallet_balances so tinha a policy
-- "Users can view own wallet balances" (uid() = user_id). Resultado: o admin
-- enxergava apenas a PROPRIA carteira e o saldo real de todos os outros
-- aparecia como R$ 0,00 na lista de contas.
--
-- Correcao: policy adicional de SELECT liberando leitura de qualquer carteira
-- para administradores ativos. Escrita continua restrita ao service_role.
-- ---------------------------------------------------------------------------

drop policy if exists "Admins can view all wallet balances" on public.wallet_balances;

create policy "Admins can view all wallet balances"
  on public.wallet_balances
  for select
  using (public.is_admin());
