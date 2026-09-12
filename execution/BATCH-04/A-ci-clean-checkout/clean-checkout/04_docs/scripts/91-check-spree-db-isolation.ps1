param(
  [string]$PrebuiltProject = "spree-demo",
  [string]$SourceProject = "spree-demo-source"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$DemoRoot = Join-Path $Root "02_demos/spree-demo"
$QuickCompose = Join-Path $DemoRoot "docker-compose.yml"
$SourceCompose = Join-Path $DemoRoot "docker-compose.dev.yml"

if (-not (Test-Path $QuickCompose)) { throw "Spree Quick Start compose file not found: $QuickCompose" }
if (-not (Test-Path $SourceCompose)) { throw "Spree source/dev compose file not found: $SourceCompose" }
if ($PrebuiltProject -eq $SourceProject) { throw "Spree prebuilt and source Compose projects must be different." }

function Get-PostgresImage([string]$Path) {
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match '^\s*image:\s*postgres:' } | Select-Object -First 1
  if (-not $line) { return "UNKNOWN" }
  return (($line -replace '^\s*image:\s*', '').Trim())
}

function Get-PostgresVolume([string]$Path) {
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match '^\s*-?\s*postgres_data:/|^\s*postgres_data:' } | Select-Object -First 1
  if (-not $line) { return "UNKNOWN" }
  return "postgres_data"
}

function Get-ComposeVolume([string]$ComposePath, [string]$Project) {
  $values = @(& docker compose -p $Project -f $ComposePath config --volumes 2>$null)
  if ($LASTEXITCODE -ne 0) { throw "docker compose config failed for $ComposePath" }
  $volume = $values | Where-Object { $_ -match 'postgres' } | Select-Object -First 1
  if (-not $volume) { throw "No PostgreSQL volume was resolved for Compose project $Project" }
  return "${Project}_$($volume.Trim())"
}

$quickImage = Get-PostgresImage $QuickCompose
$sourceImage = Get-PostgresImage $SourceCompose
$quickLogical = Get-PostgresVolume $QuickCompose
$sourceLogical = Get-PostgresVolume $SourceCompose
$quickPhysical = Get-ComposeVolume $QuickCompose $PrebuiltProject
$sourcePhysical = Get-ComposeVolume $SourceCompose $SourceProject

Write-Host "Spree database isolation guard" -ForegroundColor Cyan
Write-Host "  Prebuilt: project=$PrebuiltProject image=$quickImage logical_volume=$quickLogical physical_volume=$quickPhysical"
Write-Host "  Source:   project=$SourceProject image=$sourceImage logical_volume=$sourceLogical physical_volume=$sourcePhysical"
if ($quickPhysical -eq $sourcePhysical) {
  throw "SPREE_DB_ISOLATION_GUARD=FAIL: prebuilt and source compose resolve the same physical PostgreSQL volume. Do not start the source runtime."
}
Write-Host "SPREE_DB_ISOLATION_GUARD=PASS" -ForegroundColor Green
