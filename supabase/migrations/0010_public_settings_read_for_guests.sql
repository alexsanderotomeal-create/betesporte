-- Leitura das configuracoes da casa para visitante (anon).
--
-- A politica criada em 0001 so cobria `authenticated`, e o app le os parametros
-- logo na abertura da pagina, antes (ou sem) sessao: como anon via ZERO linhas,
-- o front caia nos defaults — e o QR de deposito saia com a chave
-- `financeiro@primasbet.bet.br`, que nao existe em banco nenhum. Os valores sao
-- instrucoes publicas de pagamento (chave PIX, banco, minimos), nao dados
-- sensiveis; por isso a politica ja se chama "leitura publica".

drop policy if exists "settings sao de leitura publica" on public.system_settings;
create policy "settings sao de leitura publica" on public.system_settings
  for select to anon, authenticated using (true);

grant select on public.system_settings to anon;
