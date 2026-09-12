[CmdletBinding()]
param(
  [Nullable[int]]$DatabasePort,
  [Nullable[int]]$BackendPort,
  [Nullable[int]]$StorefrontPort,
  [string]$ProjectName,
  [switch]$StorefrontOnly
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

$settings = Resolve-TemplateSettings -DatabasePort $DatabasePort -BackendPort $BackendPort -StorefrontPort $StorefrontPort -ProjectName $ProjectName -RequireSavedConfig
$null = Assert-ExactPnpm

$backendEnvPath = Join-Path $script:BackendRoot ".env"
if (-not $StorefrontOnly) {
  if (-not (Test-Path -LiteralPath $backendEnvPath)) { throw "Backend runtime env is missing. Run setup-local.ps1 first." }
}
$storefrontEnvPath = Join-Path $script:StorefrontRoot ".env.local"
if (-not (Test-Path -LiteralPath $storefrontEnvPath)) { throw "Storefront runtime env is missing. Run setup-local.ps1 first." }

if (-not $StorefrontOnly) {
  $backendStop = Stop-ManagedProcess (Join-Path $script:RuntimeRoot "backend.pid")
  if ($backendStop.Status -notin @("STOPPED", "NOT_RUNNING")) { throw "BUILD_BLOCKED: backend managed process could not be stopped safely. $($backendStop.Reason)" }
}
$storefrontStop = Stop-ManagedProcess (Join-Path $script:RuntimeRoot "storefront.pid")
if ($storefrontStop.Status -notin @("STOPPED", "NOT_RUNNING")) { throw "BUILD_BLOCKED: storefront managed process could not be stopped safely. $($storefrontStop.Reason)" }

if (-not $StorefrontOnly) {
  Set-ProcessEnvironment (Read-KeyValueFile $backendEnvPath)
  $env:NODE_ENV = "production"
  $env:PORT = "$($settings.BackendPort)"

  Move-GeneratedTree (Join-Path $script:BackendRoot ".medusa") "backend-medusa"
  Write-Host "BACKEND_PRODUCTION_BUILD=START"
  $started = Get-Date
  Invoke-TemplatePnpm $script:BackendRoot @("run", "build")
  Write-Host ("BACKEND_PRODUCTION_BUILD_SECONDS={0:N1}" -f ((Get-Date) - $started).TotalSeconds)
  if (-not (Test-Path -LiteralPath (Join-Path $script:BackendRoot ".medusa/server/package.json"))) { throw "Backend production artifact was not generated." }
  Write-Host "BACKEND_PRODUCTION_BUILD=PASS"

  $backendDecision = Get-ManagedServiceReuseDecision (Join-Path $script:RuntimeRoot "backend.pid") "backend" (Join-Path $script:BackendRoot ".medusa/server") $settings.BackendPort "http://127.0.0.1:$($settings.BackendPort)/health"
  if ($backendDecision.Status -eq "START_ALLOWED") {
    & (Join-Path $PSScriptRoot "start-local.ps1") -DatabasePort $settings.DatabasePort -BackendPort $settings.BackendPort -StorefrontPort $settings.StorefrontPort -ProjectName $settings.ProjectName -BackendOnly
    if ($LASTEXITCODE -ne 0) { throw "Backend could not be restarted before the storefront production build." }
  } elseif ($backendDecision.Status -ne "REUSE") { throw ("SERVICE_IDENTITY_CONFLICT: backend cannot be reused or replaced safely. " + $backendDecision.Status + ": " + $backendDecision.Reason) }
}

Set-ProcessEnvironment (Read-KeyValueFile $storefrontEnvPath)
$env:NODE_ENV = "production"
$env:NEXT_PUBLIC_MEDUSA_BACKEND_URL = "http://127.0.0.1:$($settings.BackendPort)"
$env:NEXT_PUBLIC_BASE_URL = "http://localhost:$($settings.StorefrontPort)"

Move-GeneratedTree (Join-Path $script:StorefrontRoot ".next") "storefront-next"
Write-Host "STOREFRONT_PRODUCTION_BUILD=START"
$started = Get-Date
Invoke-TemplatePnpm $script:StorefrontRoot @("run", "build")
Write-Host ("STOREFRONT_PRODUCTION_BUILD_SECONDS={0:N1}" -f ((Get-Date) - $started).TotalSeconds)
if (-not (Test-Path -LiteralPath (Join-Path $script:StorefrontRoot ".next/BUILD_ID"))) { throw "Storefront production artifact was not generated." }
Write-Host "STOREFRONT_PRODUCTION_BUILD=PASS"
Write-Host "PRODUCTION_BUILD=PASS"
