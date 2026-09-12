param(
  [switch]$ConfirmReset,
  [switch]$DeleteClone
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")
$Root = Get-ProjectRoot
$Compose = Join-Path $Root "02_demos/medusa-local/docker-compose.db.yml"
$Project = "crossborder-medusa"
$Clone = Join-Path $Root "02_demos/medusa-dtc"
$Credentials = Join-Path $Root "02_demos/medusa-admin.local.txt"
$InitRecord = Join-Path $Root "02_demos/medusa-init-mode.local.txt"

if ($DeleteClone -and -not $ConfirmReset) {
  throw "-DeleteClone requires -ConfirmReset. No reset was performed."
}

$volumeNames = @(& docker compose -p $Project -f $Compose config --volumes 2>$null)
$containerNames = @(& docker compose -p $Project -f $Compose config --services 2>$null)
Write-Host "Medusa reset plan (dry run unless -ConfirmReset is supplied):" -ForegroundColor Cyan
Write-Host "  Containers: $($containerNames -join ', ') in Compose project $Project"
Write-Host "  Volumes to delete: $($volumeNames -join ', ')"
Write-Host "  Credential file to delete: $Credentials"
Write-Host "  Initialization record to delete: $InitRecord"
Write-Host "  PostgreSQL image identity record: preserved"
if ($DeleteClone) { Write-Host "  Source clone to delete: $Clone" -ForegroundColor Yellow }

if (-not $ConfirmReset) {
  Write-Host "DRY_RUN_ONLY: no container, volume, credential, runtime state, or source clone was deleted." -ForegroundColor Green
  exit 0
}

Write-Host "Stopping and deleting the disposable Medusa database volume..." -ForegroundColor Cyan
& docker compose -p $Project -f $Compose down -v
if ($LASTEXITCODE -ne 0) { throw "docker compose down -v failed" }

Remove-Item $Credentials -Force -ErrorAction SilentlyContinue
Remove-Item $InitRecord -Force -ErrorAction SilentlyContinue

if ($DeleteClone) {
  Write-Host "Deleting the runtime DTC starter clone..." -ForegroundColor Yellow
  Remove-Item $Clone -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $Root "02_demos/medusa-dtc.UPSTREAM.txt") -Force -ErrorAction SilentlyContinue
} else {
  Write-Host "Clone preserved. Use -ConfirmReset -DeleteClone only when a completely fresh upstream clone is required." -ForegroundColor Yellow
  Write-Host "[INFO] PostgreSQL image identity record is intentionally preserved for repeatability." -ForegroundColor Yellow
}

Write-Host "LOCAL_RESET_DONE" -ForegroundColor Green
