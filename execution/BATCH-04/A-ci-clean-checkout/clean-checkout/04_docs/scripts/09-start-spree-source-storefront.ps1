[CmdletBinding()]
param(
  [int]$Port = 3002,
  [string]$BackendUrl = "http://127.0.0.1:9200",
  [string]$ComposeFile = "02_demos/spree-local/docker-compose.source.yml",
  [string]$ProjectName = "spree-demo-source"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$Storefront = Join-Path $Root "02_demos/spree-demo/apps/storefront"
$ComposePath = Join-Path $Root $ComposeFile

if (-not (Test-Path -LiteralPath $Storefront)) { throw "Missing storefront: $Storefront" }
if (-not (Test-Path -LiteralPath $ComposePath)) { throw "Missing source compose file: $ComposePath" }

$keyCommand = 'docker compose -p "{0}" -f "{1}" run --rm -T web bin/rails spree:cli:ensure_api_key 2>&1' -f $ProjectName, $ComposePath
$keyOutput = & cmd.exe /d /c $keyCommand
$publishableKey = [regex]::Match(($keyOutput -join [Environment]::NewLine), 'pk_[A-Za-z0-9_-]+').Value
if (-not $publishableKey) { throw "Could not resolve source publishable API key." }

$env:SPREE_API_URL = $BackendUrl
$env:SPREE_PUBLISHABLE_KEY = $publishableKey
$env:NEXT_PUBLIC_DEFAULT_COUNTRY = "us"
$env:NEXT_PUBLIC_DEFAULT_LOCALE = "en"
$env:NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:$Port"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outLog = Join-Path $env:TEMP "cb-dev-016-spree-storefront-$stamp.out.log"
$errLog = Join-Path $env:TEMP "cb-dev-016-spree-storefront-$stamp.err.log"
$corepack = (Get-Command corepack).Source
$process = Start-Process -FilePath $corepack -ArgumentList @("pnpm", "exec", "next", "start", "-p", $Port) -WorkingDirectory $Storefront -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2
if ($process.HasExited) { throw "Storefront production process exited with code $($process.ExitCode). See $errLog" }

Write-Host "STOREFRONT_PRODUCTION_PID=$($process.Id)"
Write-Host "STOREFRONT_PRODUCTION_PORT=$Port"
Write-Host "STOREFRONT_PRODUCTION_OUTPUT=$outLog"
Write-Host "STOREFRONT_PRODUCTION_ERROR=$errLog"
Write-Host "STOREFRONT_PRODUCTION_START=PASS"
