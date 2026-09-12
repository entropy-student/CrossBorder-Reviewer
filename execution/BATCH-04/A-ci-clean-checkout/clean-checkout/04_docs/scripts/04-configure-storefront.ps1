param(
  [Parameter(Mandatory=$true)][string]$PublishableKey,
  [string]$DefaultRegion = "us"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")
$Root = Get-ProjectRoot
$Target = Join-Path $Root "02_demos/medusa-dtc"
$Template = Join-Path $Target "apps/storefront/.env.template"
$Env = Join-Path $Target "apps/storefront/.env.local"

if (-not (Test-Path $Template)) { throw "Storefront .env.template not found. Run 03-prepare-medusa.ps1 first." }
if ($PublishableKey -notmatch '^pk_') {
  Write-Host "[WARN] Publishable key does not start with pk_. Verify it was copied from Settings -> Publishable API Keys." -ForegroundColor Yellow
}

Copy-Item $Template $Env -Force
$content = Get-Content $Env -Raw
foreach ($requiredKey in @(
  "NEXT_PUBLIC_MEDUSA_BACKEND_URL",
  "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_DEFAULT_REGION",
  "NEXT_PUBLIC_BASE_URL"
)) {
  Assert-DotEnvKey $content $requiredKey $Template
}
$content = Set-DotEnvValue $content "NEXT_PUBLIC_MEDUSA_BACKEND_URL" "http://localhost:9000"
$content = Set-DotEnvValue $content "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" $PublishableKey
$content = Set-DotEnvValue $content "NEXT_PUBLIC_DEFAULT_REGION" $DefaultRegion.ToLowerInvariant()
$content = Set-DotEnvValue $content "NEXT_PUBLIC_BASE_URL" "http://localhost:8000"
Set-Utf8NoBomFile $Env $content

Write-Host "STOREFRONT_ENV_READY" -ForegroundColor Green
Write-Host "Configured default region: $($DefaultRegion.ToLowerInvariant())"
Write-Host "Next: from 02_demos/medusa-dtc run pnpm storefront:dev (or the pnpm path printed by prepare)."
