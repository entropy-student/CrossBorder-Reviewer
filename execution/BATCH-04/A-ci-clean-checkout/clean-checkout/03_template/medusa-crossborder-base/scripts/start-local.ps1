[CmdletBinding()]
param(
  [Nullable[int]]$DatabasePort,
  [Nullable[int]]$BackendPort,
  [Nullable[int]]$StorefrontPort,
  [string]$ProjectName,
  [switch]$BackendOnly,
  [switch]$StorefrontOnly
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

if ($BackendOnly -and $StorefrontOnly) { throw "Choose at most one of -BackendOnly or -StorefrontOnly." }
$settings = Resolve-TemplateSettings -DatabasePort $DatabasePort -BackendPort $BackendPort -StorefrontPort $StorefrontPort -ProjectName $ProjectName -RequireSavedConfig
$null = Assert-ExactPnpm

$backendEnv = $null
if (-not $StorefrontOnly) {
  $backendEnvPath = Join-Path $script:BackendRoot ".env"
  if (-not (Test-Path -LiteralPath $backendEnvPath)) { throw "Backend .env is missing. Run setup-local.ps1 first." }
  $backendEnv = Read-KeyValueFile $backendEnvPath
  if (-not $backendEnv.DATABASE_URL) { throw "Backend .env is missing. Run setup-local.ps1 first." }
  if ($backendEnv.DATABASE_URL -notmatch (":$($settings.DatabasePort)/")) { throw "Backend DATABASE_URL does not match the saved DatabasePort $($settings.DatabasePort). Run setup-local.ps1 for this template copy." }
  $server = Join-Path $script:BackendRoot ".medusa/server"
  $cli = Join-Path $script:BackendRoot "node_modules/@medusajs/cli/cli.js"
  if (-not (Test-Path -LiteralPath (Join-Path $server "package.json"))) { throw "Backend production artifact is missing. Run build-production.ps1 first." }
  if (-not (Test-Path -LiteralPath $cli)) { throw "Medusa CLI is missing. Run setup-local.ps1 first." }
}

$storefrontEnv = $null
if (-not $BackendOnly) {
  $storefrontEnvPath = Join-Path $script:StorefrontRoot ".env.local"
  if (-not (Test-Path -LiteralPath $storefrontEnvPath)) { throw "Storefront .env.local is missing. Run setup-local.ps1 first." }
  $storefrontEnv = Read-KeyValueFile $storefrontEnvPath
  if (-not $storefrontEnv.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY) { throw "Storefront .env.local is missing a publishable key. Run setup-local.ps1 first." }
  if (-not (Test-Path -LiteralPath (Join-Path $script:StorefrontRoot ".next/BUILD_ID"))) { throw "Storefront production artifact is missing. Run build-production.ps1 first." }
}

Set-TemplateComposeEnvironment $settings
Push-Location $script:TemplateRoot
try {
  & docker compose -p $settings.ProjectName -f $script:ComposeFile up -d postgres
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL startup failed." }
} finally { Pop-Location }

if (-not $StorefrontOnly) {
  Set-ProcessEnvironment $backendEnv
  $env:NODE_ENV = "production"
  $env:PORT = "$($settings.BackendPort)"
  $env:STORE_CORS = "http://localhost:$($settings.StorefrontPort)"
  $env:ADMIN_CORS = "http://localhost:$($settings.BackendPort)"
  $env:AUTH_CORS = "http://localhost:$($settings.BackendPort),http://localhost:$($settings.StorefrontPort)"
  $env:NO_PROXY = "127.0.0.1,localhost"
  $env:no_proxy = $env:NO_PROXY
}

if (-not $StorefrontOnly) {
  $backendDecision = Get-ManagedServiceReuseDecision (Join-Path $script:RuntimeRoot "backend.pid") "backend" (Join-Path $script:BackendRoot ".medusa/server") $settings.BackendPort "http://127.0.0.1:$($settings.BackendPort)/health"
  if ($backendDecision.Status -eq "START_ALLOWED") {
    $logs = Join-Path $script:RuntimeRoot "logs"
    New-Item -ItemType Directory -Force -Path $logs | Out-Null
    $process = Start-Process -FilePath "node.exe" -ArgumentList @($cli, "start", "--port", "$($settings.BackendPort)") -WorkingDirectory $server -RedirectStandardOutput (Join-Path $logs "backend.out.log") -RedirectStandardError (Join-Path $logs "backend.err.log") -WindowStyle Hidden -PassThru
    try { Write-ManagedProcessRecord (Join-Path $script:RuntimeRoot "backend.pid") $process.Id "backend" $settings.ProjectName $script:TemplateRoot $server | Out-Null } catch { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue; throw }
    Write-Host "MEDUSA_TEMPLATE_BACKEND_PID=$($process.Id)"
    try { $null = Wait-LocalHttp "http://127.0.0.1:$($settings.BackendPort)/health" 90; $startedIdentity = Get-ManagedServiceReuseDecision (Join-Path $script:RuntimeRoot "backend.pid") "backend" $server $settings.BackendPort "http://127.0.0.1:$($settings.BackendPort)/health"; if ($startedIdentity.Status -ne "REUSE") { throw "Started backend failed managed listener identity verification: $($startedIdentity.Status): $($startedIdentity.Reason)" } } catch {
      Get-Content (Join-Path $logs "backend.out.log") -Tail 80 -ErrorAction SilentlyContinue
      Get-Content (Join-Path $logs "backend.err.log") -Tail 80 -ErrorAction SilentlyContinue
      throw
    }
  } elseif ($backendDecision.Status -eq "REUSE") { Write-Host "MEDUSA_TEMPLATE_BACKEND_REUSED=PASS" } else { throw ("SERVICE_IDENTITY_CONFLICT: backend cannot be reused or replaced safely. " + $backendDecision.Status + ": " + $backendDecision.Reason) }
  Write-Host "MEDUSA_TEMPLATE_BACKEND_READY=PASS"
}

if (-not $BackendOnly) {
  Set-ProcessEnvironment $storefrontEnv
  $env:NODE_ENV = "production"
  $env:NEXT_PUBLIC_MEDUSA_BACKEND_URL = "http://127.0.0.1:$($settings.BackendPort)"
  $env:NEXT_PUBLIC_DEFAULT_REGION = "us"
  $env:NEXT_PUBLIC_BASE_URL = "http://localhost:$($settings.StorefrontPort)"
  $storefrontDecision = Get-ManagedServiceReuseDecision (Join-Path $script:RuntimeRoot "storefront.pid") "storefront" $script:StorefrontRoot $settings.StorefrontPort "http://127.0.0.1:$($settings.StorefrontPort)/us"
  if ($storefrontDecision.Status -eq "START_ALLOWED") {
    $logs = Join-Path $script:RuntimeRoot "logs"
    New-Item -ItemType Directory -Force -Path $logs | Out-Null
    $process = Start-Process -FilePath $script:Corepack -ArgumentList @(("pnpm@" + (Get-RequiredPnpmVersion)), "exec", "next", "start", "-p", "$($settings.StorefrontPort)") -WorkingDirectory $script:StorefrontRoot -RedirectStandardOutput (Join-Path $logs "storefront.out.log") -RedirectStandardError (Join-Path $logs "storefront.err.log") -WindowStyle Hidden -PassThru
    try { Write-ManagedProcessRecord (Join-Path $script:RuntimeRoot "storefront.pid") $process.Id "storefront" $settings.ProjectName $script:TemplateRoot $script:StorefrontRoot | Out-Null } catch { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue; throw }
    Write-Host "MEDUSA_TEMPLATE_STOREFRONT_PID=$($process.Id)"
    try { $null = Wait-LocalHttp "http://127.0.0.1:$($settings.StorefrontPort)/us" 90; $startedIdentity = Get-ManagedServiceReuseDecision (Join-Path $script:RuntimeRoot "storefront.pid") "storefront" $script:StorefrontRoot $settings.StorefrontPort "http://127.0.0.1:$($settings.StorefrontPort)/us"; if ($startedIdentity.Status -ne "REUSE") { throw "Started storefront failed managed listener identity verification: $($startedIdentity.Status): $($startedIdentity.Reason)" } } catch {
      Get-Content (Join-Path $logs "storefront.out.log") -Tail 80 -ErrorAction SilentlyContinue
      Get-Content (Join-Path $logs "storefront.err.log") -Tail 80 -ErrorAction SilentlyContinue
      throw
    }
  } elseif ($storefrontDecision.Status -eq "REUSE") { Write-Host "MEDUSA_TEMPLATE_STOREFRONT_REUSED=PASS" } else { throw ("SERVICE_IDENTITY_CONFLICT: storefront cannot be reused or replaced safely. " + $storefrontDecision.Status + ": " + $storefrontDecision.Reason) }
  Write-Host "MEDUSA_TEMPLATE_STOREFRONT_READY=PASS"
}

Write-Host "MEDUSA_TEMPLATE_LOCAL_RUNTIME=PASS"
Write-Host "Admin URL: http://localhost:$($settings.BackendPort)/app"
Write-Host "Storefront URL: http://localhost:$($settings.StorefrontPort)/us"
