$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Storefront = Join-Path $ProjectRoot '02_demos\medusa-dtc\apps\storefront'
$NodeScriptSource = Join-Path $ProjectRoot '04_docs\node\us-order-smoke.mjs'
$NodeScriptTarget = Join-Path $Storefront 'us-order-smoke.mjs'

if (!(Test-Path $Storefront)) { throw "Storefront directory not found: $Storefront" }
if (!(Test-Path $NodeScriptSource)) { throw "Smoke script not found: $NodeScriptSource" }

& curl.exe --noproxy '*' --fail --silent --show-error --max-time 5 'http://localhost:9000/health' *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Medusa backend is not reachable on http://localhost:9000. Start the 9000 backend first.'
}

Copy-Item $NodeScriptSource $NodeScriptTarget -Force
Push-Location $Storefront
try {
  Write-Host 'Running automated US/USD checkout smoke test...'
  node $NodeScriptTarget
  if ($LASTEXITCODE -ne 0) { throw "US/USD smoke test failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
  Remove-Item $NodeScriptTarget -Force -ErrorAction SilentlyContinue
}
