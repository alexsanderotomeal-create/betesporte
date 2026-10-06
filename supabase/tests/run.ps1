# Sobe um Postgres temporario no Docker, aplica o schema de referencia (stub do
# schema real do Supabase), roda as tres migrations DOIS VEZES (prova de que sao
# reexecutaveis) e executa os testes de fluxo financeiro/eleitoral em
# supabase/tests/financial_flows.sql.
#
#   powershell -ExecutionPolicy Bypass -File supabase\tests\run.ps1
#
# Sai com exit code != 0 se qualquer migration ou qualquer assert falhar.
param([switch]$KeepDb)
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here '..\..')
$img  = 'primasbet-pg'

if (-not $KeepDb) {
  docker rm -f $img 2>$null | Out-Null
  docker run -d --name $img -e POSTGRES_PASSWORD=primas -e POSTGRES_DB=primasbet -p 15432:5432 postgres:16-alpine | Out-Null
  Start-Sleep -Seconds 7
  docker exec $img pg_isready -U postgres | Out-Null
}

foreach ($f in @("$here\schema_stub.sql",
                 "$root\supabase\migrations\0001_init.sql",
                 "$root\supabase\migrations\0002_financial_functions.sql",
                 "$root\supabase\migrations\0003_election_market.sql",
                 "$here\financial_flows.sql")) { docker cp $f "${img}:/tmp/" | Out-Null }

# O stub de schema roda uma vez so; as migrations do projeto, duas.
foreach ($pass in 1,2) {
  $steps = @('0001_init.sql','0002_financial_functions.sql','0003_election_market.sql')
  if ($pass -eq 1) { $steps = @('schema_stub.sql') + $steps }
  foreach ($m in $steps) {
    $out = docker exec $img psql -U postgres -d primasbet -v ON_ERROR_STOP=1 -f "/tmp/$m" 2>&1
    if ($LASTEXITCODE -ne 0) { "=== FALHOU passo $pass : $m ==="; $out | Select-Object -Last 20; exit 1 }
    if ($pass -eq 2) { "ok 2x: $m" } else { "ok: $m" }
  }
}

""
$out = docker exec $img psql -U postgres -d primasbet -f /tmp/financial_flows.sql 2>&1
$out | Where-Object { $_ -match 'NOTICE|ERROR|FAIL|===' } | ForEach-Object { "$_" }
if ($LASTEXITCODE -ne 0) { "TEST_EXIT=$LASTEXITCODE"; exit $LASTEXITCODE }
"TEST_EXIT=0"
exit 0
