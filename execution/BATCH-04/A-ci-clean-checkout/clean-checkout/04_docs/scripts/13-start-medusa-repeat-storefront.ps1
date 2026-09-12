[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$PublishableKey,
  [int]$Port = 8003,
  [int]$BackendPort = 9300,
  [string]$LogDirectory = ".runtime/medusa-repeat"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$Storefront = Join-Path $Root "02_demos/medusa-dtc/apps/storefront"
$Pnpm = Join-Path $Root ".tooling/pnpm-10.11.1/node_modules/.bin/pnpm.cmd"
$Logs = Join-Path $Root $LogDirectory
if (-not (Test-Path -LiteralPath (Join-Path $Storefront ".next"))) { throw "Medusa repeat storefront production artifact is missing." }
if (-not (Test-Path -LiteralPath $Pnpm)) { throw "Exact project pnpm 10.11.1 is missing." }
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$env:NODE_ENV = "production"
$env:NEXT_PUBLIC_MEDUSA_BACKEND_URL = "http://127.0.0.1:$BackendPort"
$env:NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = $PublishableKey
$env:NEXT_PUBLIC_DEFAULT_REGION = "us"
$env:NEXT_PUBLIC_BASE_URL = "http://127.0.0.1:$Port"
$stdout = Join-Path $Logs "storefront.out.log"
$stderr = Join-Path $Logs "storefront.err.log"
$started = Get-Date
$process = Start-Process -FilePath $Pnpm -ArgumentList @("exec", "next", "start", "-p", "$Port") -WorkingDirectory $Storefront -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
Write-Host "MEDUSA_REPEAT_STOREFRONT_PID=$($process.Id)"
$deadline = (Get-Date).AddSeconds(60)
$ready = $false
do {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/us" -TimeoutSec 5
    $ready = $response.StatusCode -eq 200
  } catch { $ready = $false }
  if ($ready) { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
Write-Host ("MEDUSA_REPEAT_STOREFRONT_COLD_START_SECONDS={0:N1}" -f ((Get-Date)-$started).TotalSeconds)
Write-Host "MEDUSA_REPEAT_STOREFRONT_READY=$ready"
if (-not $ready) {
  Get-Content -LiteralPath $stdout -Tail 80 -ErrorAction SilentlyContinue
  Get-Content -LiteralPath $stderr -Tail 80 -ErrorAction SilentlyContinue
  throw "Medusa repeat storefront production runtime did not become ready."
}
