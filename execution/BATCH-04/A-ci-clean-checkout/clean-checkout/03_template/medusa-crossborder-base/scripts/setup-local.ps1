[CmdletBinding()]
param(
  [Nullable[int]]$DatabasePort,
  [Nullable[int]]$BackendPort,
  [Nullable[int]]$StorefrontPort,
  [string]$ProjectName,
  [string]$AdminEmail = "template-admin@local.test"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

$savedConfig = Read-TemplateRuntimeConfig
$settings = Resolve-TemplateSettings -DatabasePort $DatabasePort -BackendPort $BackendPort -StorefrontPort $StorefrontPort -ProjectName $ProjectName -AllowFreshIdentity
$null = Assert-ExactPnpm
$volume = Assert-FreshTemplateVolume -ProjectName $settings.ProjectName -AllowReuse:($null -ne $savedConfig)
New-Item -ItemType Directory -Force -Path $script:RuntimeRoot | Out-Null
Write-TemplateRuntimeConfig $settings
Set-TemplateComposeEnvironment $settings

Push-Location $script:TemplateRoot
try {
  & docker compose -p $settings.ProjectName -f $script:ComposeFile up -d postgres
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL startup failed." }
} finally { Pop-Location }

$backendTemplate = Join-Path $script:BackendRoot ".env.template"
$backendEnvPath = Join-Path $script:BackendRoot ".env"
if (-not (Test-Path -LiteralPath $backendTemplate)) { throw "Backend .env.template is missing." }
if (Test-Path -LiteralPath $backendEnvPath) { $backendContent = Get-Content -LiteralPath $backendEnvPath -Raw } else { $backendContent = Get-Content -LiteralPath $backendTemplate -Raw }
$backendContent = Set-DotEnvValue $backendContent "DATABASE_URL" "postgres://medusa:medusa_local_dev@127.0.0.1:$($settings.DatabasePort)/medusa_dtc"
$backendContent = Set-DotEnvValue $backendContent "STORE_CORS" "http://localhost:$($settings.StorefrontPort)"
$backendContent = Set-DotEnvValue $backendContent "ADMIN_CORS" "http://localhost:$($settings.BackendPort)"
$backendContent = Set-DotEnvValue $backendContent "AUTH_CORS" "http://localhost:$($settings.BackendPort),http://localhost:$($settings.StorefrontPort)"
$backendContent = Set-DotEnvValue $backendContent "REDIS_URL" ""
$jwt = Get-DotEnvValue $backendContent "JWT_SECRET"
$cookie = Get-DotEnvValue $backendContent "COOKIE_SECRET"
if (-not $jwt -or $jwt -eq "supersecret" -or $jwt.Length -lt 32) { $backendContent = Set-DotEnvValue $backendContent "JWT_SECRET" ("template-jwt-" + [guid]::NewGuid().ToString("N")) }
if (-not $cookie -or $cookie -eq "supersecret" -or $cookie.Length -lt 32) { $backendContent = Set-DotEnvValue $backendContent "COOKIE_SECRET" ("template-cookie-" + [guid]::NewGuid().ToString("N")) }
Set-Utf8NoBomFile $backendEnvPath $backendContent
Set-ProcessEnvironment (Read-KeyValueFile $backendEnvPath)

Write-Host "MEDUSA_TEMPLATE_INSTALL=START"
Invoke-TemplatePnpm $script:TemplateRoot @("install", "--frozen-lockfile")
Write-Host "MEDUSA_TEMPLATE_INSTALL=PASS"

Push-Location $script:BackendRoot
try {
  Write-Host "MEDUSA_TEMPLATE_MIGRATION=START"
  & $script:Corepack ("pnpm@" + (Get-RequiredPnpmVersion)) exec medusa db:migrate
  if ($LASTEXITCODE -ne 0) { throw "Medusa migration failed." }
  Write-Host "MEDUSA_BASELINE_SEEDED_BY_MIGRATION"
  Write-Host "MEDUSA_TEMPLATE_MIGRATION=PASS"
} finally { Pop-Location }

Push-Location $script:BackendRoot
try {
  Write-Host "MEDUSA_US_USD_AUGMENTATION=START"
  & $script:Corepack ("pnpm@" + (Get-RequiredPnpmVersion)) exec medusa exec (Join-Path $script:TemplateRoot "scripts/medusa-crossborder-augment.ts")
  if ($LASTEXITCODE -ne 0) { throw "US/USD augmentation failed." }
  Write-Host "MEDUSA_US_USD_AUGMENTATION=PASS"
} finally { Pop-Location }

$credentialPath = Join-Path $script:RuntimeRoot "admin.local.txt"
$credential = Read-KeyValueFile $credentialPath
if (-not $credential["email"]) { $credential["email"] = $AdminEmail }
if (-not $credential["password"]) { $credential["password"] = "Template-" + [guid]::NewGuid().ToString("N") }
$safeEmail = $credential["email"].Replace("'", "''")
$adminExistsSql = "SELECT 1 FROM public.user WHERE lower(email)=lower('$safeEmail') LIMIT 1;"
$container = (& docker compose -p $settings.ProjectName -f $script:ComposeFile ps -q postgres).Trim()
if (-not $container) { throw "Template PostgreSQL container could not be resolved." }
$adminExists = ((& docker exec $container psql -U medusa -d medusa_dtc -Atc $adminExistsSql) -join "").Trim() -eq "1"
if (-not $adminExists) {
  Push-Location $script:BackendRoot
  try {
    & $script:Corepack ("pnpm@" + (Get-RequiredPnpmVersion)) exec medusa user -e $credential["email"] -p $credential["password"]
    if ($LASTEXITCODE -ne 0) { throw "Template Admin creation failed." }
  } finally { Pop-Location }
  $adminExists = ((& docker exec $container psql -U medusa -d medusa_dtc -Atc $adminExistsSql) -join "").Trim() -eq "1"
}
if (-not $adminExists) { throw "Template Admin credential was not verified against the new validation DB." }
Write-KeyValueFile $credentialPath @{ purpose = "local-only-template-validation"; email = $credential["email"]; password = $credential["password"] }
Write-Host "TEMPLATE_FREEZE_CREDENTIAL_BLOCKER=RESOLVED"
Write-Host "TEMPLATE_ADMIN_CREATED_OR_REUSED=PASS"

Stop-ManagedProcess (Join-Path $script:RuntimeRoot "backend.pid")
Stop-ManagedProcess (Join-Path $script:RuntimeRoot "storefront.pid")
Write-Host "BACKEND_PRODUCTION_BUILD=START"
$backendBuildStarted = Get-Date
Invoke-TemplatePnpm $script:BackendRoot @("run", "build")
Write-Host ("BACKEND_PRODUCTION_BUILD_SECONDS={0:N1}" -f ((Get-Date) - $backendBuildStarted).TotalSeconds)
if (-not (Test-Path -LiteralPath (Join-Path $script:BackendRoot ".medusa/server/package.json"))) { throw "Backend production artifact was not generated." }
Write-Host "BACKEND_PRODUCTION_BUILD=PASS"
& (Join-Path $PSScriptRoot "start-local.ps1") -DatabasePort $settings.DatabasePort -BackendPort $settings.BackendPort -StorefrontPort $settings.StorefrontPort -ProjectName $settings.ProjectName -BackendOnly
if ($LASTEXITCODE -ne 0) { throw "Backend production runtime startup failed." }

$login = Invoke-LocalHttp -Method POST -Uri "http://127.0.0.1:$($settings.BackendPort)/auth/user/emailpass" -Body @{ email = $credential["email"]; password = $credential["password"] }
$adminToken = $login.Json.token
if (-not $adminToken) { throw "New template Admin login did not return an auth token." }
$headers = @{ Authorization = "Bearer $adminToken" ; Accept = "application/json" }
$keys = (Invoke-LocalHttp -Method GET -Uri "http://127.0.0.1:$($settings.BackendPort)/admin/api-keys?limit=100" -Headers $headers).Json
$publishable = @($keys.api_keys) | Where-Object { $_.type -eq "publishable" -and $_.token } | Select-Object -First 1
if (-not $publishable) { throw "Migration baseline did not expose a publishable API key through the authenticated Admin API." }

$storefrontTemplate = Join-Path $script:StorefrontRoot ".env.template"
$storefrontEnvPath = Join-Path $script:StorefrontRoot ".env.local"
$storefrontContent = Get-Content -LiteralPath $storefrontTemplate -Raw
$storefrontContent = Set-DotEnvValue $storefrontContent "NEXT_PUBLIC_MEDUSA_BACKEND_URL" "http://127.0.0.1:$($settings.BackendPort)"
$storefrontContent = Set-DotEnvValue $storefrontContent "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" $publishable.token
$storefrontContent = Set-DotEnvValue $storefrontContent "NEXT_PUBLIC_DEFAULT_REGION" "us"
$storefrontContent = Set-DotEnvValue $storefrontContent "NEXT_PUBLIC_BASE_URL" "http://localhost:$($settings.StorefrontPort)"
$storefrontContent = Set-DotEnvValue $storefrontContent "NEXT_PUBLIC_CHECKOUT_EXPOSURE_MODE" "customer"
$storefrontContent = Set-DotEnvValue $storefrontContent "NODE_ENV" "production"
Set-Utf8NoBomFile $storefrontEnvPath $storefrontContent
Write-Host "TEMPLATE_PUBLISHABLE_KEY_CONFIGURED=PASS"

& (Join-Path $PSScriptRoot "build-production.ps1") -DatabasePort $settings.DatabasePort -BackendPort $settings.BackendPort -StorefrontPort $settings.StorefrontPort -ProjectName $settings.ProjectName -StorefrontOnly
if ($LASTEXITCODE -ne 0) { throw "Final production build runner failed after storefront configuration." }
& (Join-Path $PSScriptRoot "start-local.ps1") -DatabasePort $settings.DatabasePort -BackendPort $settings.BackendPort -StorefrontPort $settings.StorefrontPort -ProjectName $settings.ProjectName
if ($LASTEXITCODE -ne 0) { throw "Production backend/storefront runtime startup failed." }
& (Join-Path $PSScriptRoot "acceptance-smoke.ps1") -DatabasePort $settings.DatabasePort -BackendPort $settings.BackendPort -StorefrontPort $settings.StorefrontPort -ProjectName $settings.ProjectName
if ($LASTEXITCODE -ne 0) { throw "Template acceptance smoke failed." }

Write-Host "TEMPLATE_VALIDATION_VOLUME=$volume"
Write-Host "TEMPLATE_VALIDATION=PASS"
Write-Host "TEMPLATE_FREEZE=PASS"
