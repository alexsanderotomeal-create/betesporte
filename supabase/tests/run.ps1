# Sobe um Postgres temporario no Docker, aplica o schema de referencia (stub do
# schema real do Supabase), roda TODAS as migrations DOIS VEZES (prova de que sao
# reexecutaveis) e executa os testes de fluxo financeiro/eleitoral em
# supabase/tests/financial_flows.sql.
#
#   pwsh -File supabase/tests/run.ps1        (CI / Linux)
#   powershell -ExecutionPolicy Bypass -File supabase\tests\run.ps1
#
# Caminho com / de proposito: Windows aceita / e o pwsh do CI roda em Linux,
# onde \ nao e separador. A lista de migrations vem do diretorio: migration nova
# entra no harness so de existir o arquivo. Sai com exit code != 0 se qualquer
# migration ou qualquer assert falhar.
param([switch]$KeepDb)
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $PSCommandPath
$root = (Resolve-Path (Join-Path $here '../..')).Path
$img  = 'primasbet-pg'

$migrations = Get-ChildItem (Join-Path $root 'supabase/migrations/*.sql') |
  Sort-Object Name |
  Select-Object -ExpandProperty Name

if (-not $migrations) {
  "Nenhuma migration encontrada em $root/supabase/migrations"
  exit 1
}

if (-not $KeepDb) {
  docker rm -f $img 2>$null | Out-Null
  docker run -d --name $img -e POSTGRES_PASSWORD=primas -e POSTGRES_DB=primasbet -p 15432:5432 postgres:16-alpine | Out-Null
  Start-Sleep -Seconds 7
  docker exec $img pg_isready -U postgres | Out-Null
}

docker cp (Join-Path $here 'schema_stub.sql') "${img}:/tmp/" | Out-Null
docker cp (Join-Path $here 'financial_flows.sql') "${img}:/tmp/" | Out-Null
foreach ($m in $migrations) {
  docker cp (Join-Path $root "supabase/migrations/$m") "${img}:/tmp/" | Out-Null
}

# O stub de schema roda uma vez so; as migrations do projeto, duas.
foreach ($pass in 1,2) {
  $steps = $migrations
  if ($pass -eq 1) { $steps = @('schema_stub.sql') + $migrations }
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
