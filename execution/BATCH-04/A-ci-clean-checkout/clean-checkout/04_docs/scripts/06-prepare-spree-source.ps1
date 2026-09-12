[CmdletBinding()]
param(
  [string]$ImageTag = "spree-demo-source-backend:cb-dev-016",
  [int]$BackendPort = 9200
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$ComposeFile = Join-Path $Root "02_demos/spree-local/docker-compose.source.yml"
$ProjectName = "spree-demo-source"
$SourceVolume = "${ProjectName}_postgres_data"
$PrebuiltVolume = "spree-demo_postgres_data"

if (-not (Test-Path -LiteralPath $ComposeFile -PathType Leaf)) { throw "Missing source compose: $ComposeFile" }
if ($SourceVolume -eq $PrebuiltVolume) { throw "Source and prebuilt physical volume names must differ." }
$imageCheck = & docker image inspect $ImageTag 2>$null
if ($LASTEXITCODE -ne 0) { throw "Source image is not available: $ImageTag. Run 07-build-spree-source.ps1 first." }

function Invoke-SourceCompose([string[]]$Arguments) {
  & docker compose -p $ProjectName -f $ComposeFile @Arguments
  if ($LASTEXITCODE -ne 0) { throw "docker compose failed: $($Arguments -join ' ')" }
}

Write-Host "SOURCE_COMPOSE_PROJECT=$ProjectName"
Write-Host "SOURCE_DB_VOLUME=$SourceVolume"
Write-Host "PREBUILT_DB_VOLUME=$PrebuiltVolume"
Write-Host "SOURCE_BACKEND_PORT=$BackendPort"

Invoke-SourceCompose @("up", "-d", "postgres")
$postgresId = (& docker compose -p $ProjectName -f $ComposeFile ps -q postgres).Trim()
if (-not $postgresId) { throw "Source PostgreSQL container was not created." }
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  $health = (& docker inspect --format '{{.State.Health.Status}}' $postgresId 2>$null).Trim()
  if ($health -eq "healthy") { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { throw "Source PostgreSQL did not become healthy." }
Write-Host "SOURCE_POSTGRES_HEALTH=healthy"

Invoke-SourceCompose @("up", "-d", "web")
$backendReady = $false
$healthUrl = "http://127.0.0.1:{0}/up" -f $BackendPort
for ($i = 0; $i -lt 90; $i++) {
  $healthCode = (& curl.exe --noproxy "*" -sS -o NUL -w "%{http_code}" --max-time 5 $healthUrl 2>$null).Trim()
  if ($LASTEXITCODE -eq 0 -and $healthCode -eq "200") { $backendReady = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $backendReady) { throw "Source backend did not become healthy at $healthUrl" }
Write-Host "SOURCE_BACKEND_HEALTH=/up 200"

Invoke-SourceCompose @("run", "--rm", "-T", "--user", "root", "web", "chown", "-R", "rails:rails", "/rails/storage")
Write-Host "SOURCE_STORAGE_PERMISSIONS=PASS"
$seedProbe = & docker compose -p $ProjectName -f $ComposeFile run --rm -T web bin/rails runner "puts Spree::Store.exists?"
if ($LASTEXITCODE -ne 0) { throw "Could not inspect source baseline seed state." }
$seedProbeText = ($seedProbe -join [Environment]::NewLine)
if ($seedProbeText -match "(?m)^true\s*$") {
  Write-Host "SOURCE_DB_SEED=EXISTING_BASELINE"
} else {
  Invoke-SourceCompose @("run", "--rm", "-T", "web", "bin/rails", "db:seed")
  Write-Host "SOURCE_DB_SEED=PASS"
}
Invoke-SourceCompose @("run", "--rm", "-T", "web", "bin/rails", "spree:load_sample_data")
Write-Host "SOURCE_SAMPLE_DATA=PASS"
Invoke-SourceCompose @("run", "--rm", "-T", "web", "bin/rails", "spree:search:reindex")
Write-Host "SOURCE_SEARCH_REINDEX=PASS"

Write-Host "SOURCE_PREPARATION=PASS"
