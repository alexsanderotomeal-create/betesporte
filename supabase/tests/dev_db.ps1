# Sobe um Postgres temporario no Docker para desenvolvimento LOCAL, aplica o
# schema de referencia (stub do schema real) e roda TODAS as migrations do
# projeto (0001..0008). Diferente do run.ps1 de testes, deixas o container
# rodando ao final.
#
#   powershell -ExecutionPolicy Bypass -File supabase\tests\dev_db.ps1
#
# Conexao (qualquer cliente): postgres://postgres:primas@localhost:15432/primasbet
# Container: primasbet-pg

$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here '..\..')
$img  = 'primasbet-pg'

docker rm -f $img 2>$null | Out-Null
docker run -d --name $img -e POSTGRES_PASSWORD=primas -e POSTGRES_DB=primasbet -p 15432:5432 postgres:17-alpine | Out-Null

# aguarda o Postgres aceitar conexoes
$ready = $false
for ($i = 1; $i -le 30; $i++) {
  docker exec $img pg_isready -U postgres 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { "=== Postgres nao ficou pronto em 30s ==="; exit 1 }

foreach ($f in @("$here\schema_stub.sql",
                 "$root\supabase\migrations\0001_init.sql",
                 "$root\supabase\migrations\0002_financial_functions.sql",
                 "$root\supabase\migrations\0003_election_market.sql",
                 "$root\supabase\migrations\0004_fix_sync_profile_trigger.sql",
                 "$root\supabase\migrations\0005_fix_admin_gate_and_roles.sql",
                 "$root\supabase\migrations\0006_real_data_and_election_runoff.sql",
                 "$root\supabase\migrations\0007_sync_lock_rpcs.sql",
                 "$root\supabase\migrations\0008_sync_lock_table.sql")) {
  docker cp $f "${img}:/tmp/" | Out-Null
}

$steps = @('schema_stub.sql',
           '0001_init.sql','0002_financial_functions.sql','0003_election_market.sql',
           '0004_fix_sync_profile_trigger.sql','0005_fix_admin_gate_and_roles.sql',
           '0006_real_data_and_election_runoff.sql','0007_sync_lock_rpcs.sql',
           '0008_sync_lock_table.sql')

foreach ($m in $steps) {
  $out = docker exec $img psql -U postgres -d primasbet -v ON_ERROR_STOP=1 -f "/tmp/$m" 2>&1
  if ($LASTEXITCODE -ne 0) { "=== FALHOU: $m ==="; $out | Select-Object -Last 20; exit 1 }
  "ok: $m"
}

""
"=== banco local pronto ==="
"postgres://postgres:primas@localhost:15432/primasbet"
docker exec $img psql -U postgres -d primasbet -c "\dt public" | Out-Null
exit 0