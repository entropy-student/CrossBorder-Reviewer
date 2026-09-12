[CmdletBinding()]
param(
  [string]$BackendUrl = "http://127.0.0.1:9200",
  [string]$ComposeFile = "02_demos/spree-local/docker-compose.source.yml",
  [string]$ProjectName = "spree-demo-source",
  [string]$Country = "US",
  [string]$Currency = "USD",
  [string]$Locale = "en",
  [string]$Label = "SOURCE",
  [string]$ShippingPattern = ""
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$ComposePath = Join-Path $Root $ComposeFile
$NodeScript = Join-Path $Root "04_docs/node/spree-source-order-smoke.mjs"

if (-not (Test-Path -LiteralPath $ComposePath)) { throw "Missing source compose file: $ComposePath" }
if (-not (Test-Path -LiteralPath $NodeScript)) { throw "Missing source smoke script: $NodeScript" }

function Invoke-SourceCompose {
  param([string[]]$Arguments)
  $command = 'docker compose -p "{0}" -f "{1}" {2} 2>&1' -f $ProjectName, $ComposePath, ($Arguments -join ' ')
  & cmd.exe /d /c $command
  if ($LASTEXITCODE -ne 0) { throw "Source compose command failed with exit code $LASTEXITCODE" }
}

$publishableOutput = Invoke-SourceCompose @("run", "--rm", "-T", "web", "bin/rails", "spree:cli:ensure_api_key")
$publishableText = ($publishableOutput -join [Environment]::NewLine)
$publishableKey = [regex]::Match($publishableText, 'pk_[A-Za-z0-9_-]+').Value
if (-not $publishableKey) { throw "Source publishable API key could not be resolved." }

$adminOutput = Invoke-SourceCompose @("run", "--rm", "-T", "-e", "KEY_TYPE=secret", "-e", "NAME=CB-DEV-017-AdminRead", "-e", "SCOPES=read_all", "web", "bin/rails", "spree:cli:create_api_key")
$adminText = ($adminOutput -join [Environment]::NewLine)
$adminKey = [regex]::Match($adminText, 'sk_[A-Za-z0-9_-]+').Value
if (-not $adminKey) { throw "Source read-only Admin API key could not be created." }

$oldApiUrl = $env:SPREE_API_URL
$oldPublishableKey = $env:SPREE_PUBLISHABLE_KEY
$oldAdminKey = $env:SPREE_ADMIN_API_KEY
$oldCountry = $env:SPREE_SMOKE_COUNTRY
$oldCurrency = $env:SPREE_SMOKE_CURRENCY
$oldLocale = $env:SPREE_SMOKE_LOCALE
$oldLabel = $env:SPREE_SMOKE_LABEL
$oldShippingPattern = $env:SPREE_SMOKE_SHIPPING_PATTERN
try {
  $env:SPREE_API_URL = $BackendUrl
  $env:SPREE_PUBLISHABLE_KEY = $publishableKey
  $env:SPREE_ADMIN_API_KEY = $adminKey
  $env:SPREE_SMOKE_COUNTRY = $Country
  $env:SPREE_SMOKE_CURRENCY = $Currency
  $env:SPREE_SMOKE_LOCALE = $Locale
  $env:SPREE_SMOKE_LABEL = $Label
  $env:SPREE_SMOKE_SHIPPING_PATTERN = $ShippingPattern
  $smokeOutput = & node $NodeScript 2>&1
  $smokeExitCode = $LASTEXITCODE
  $smokeOutput | ForEach-Object { Write-Host $_ }
  if ($smokeExitCode -ne 0) { throw "Source Store/Admin API smoke failed with exit code $smokeExitCode" }
} finally {
  $env:SPREE_API_URL = $oldApiUrl
  $env:SPREE_PUBLISHABLE_KEY = $oldPublishableKey
  $env:SPREE_ADMIN_API_KEY = $oldAdminKey
  $env:SPREE_SMOKE_COUNTRY = $oldCountry
  $env:SPREE_SMOKE_CURRENCY = $oldCurrency
  $env:SPREE_SMOKE_LOCALE = $oldLocale
  $env:SPREE_SMOKE_LABEL = $oldLabel
  $env:SPREE_SMOKE_SHIPPING_PATTERN = $oldShippingPattern
}

$orderIdLine = $smokeOutput | Where-Object { $_ -match "^${Label}_ORDER_ID=" } | Select-Object -Last 1
$orderId = if ($orderIdLine) { $orderIdLine -replace "^${Label}_ORDER_ID=", '' } else { $null }
if (-not $orderId) { throw "Source smoke did not return ${Label}_ORDER_ID." }

$dbCode = 0
$dbRunner = "o=Spree::Order.find(Spree::Order.decode_prefixed_id(ENV.fetch('SOURCE_ORDER_ID'))); ship=o.ship_address; payment=o.payments.order(:id).last; rate=o.shipments.flat_map{|s| s.shipping_rates.to_a}.find{|r| r.selected?}; puts({id:o.prefixed_id,number:o.number,currency:o.currency,total:o.total.to_s,country:ship&.country&.iso,payment_method:payment&.payment_method&.name,payment_provider:payment&.payment_method&.type,shipping_method:rate&.shipping_method&.name}.to_json)"
$dbCommand = 'docker compose -p "{0}" -f "{1}" run --rm -T -e SOURCE_ORDER_ID={2} web bin/rails runner "{3}" 2>&1' -f $ProjectName, $ComposePath, $orderId, $dbRunner
$dbOutput = & cmd.exe /d /c $dbCommand
$dbCode = $LASTEXITCODE
$dbOutput | ForEach-Object { Write-Host $_ }
if ($dbCode -ne 0) { throw "Source PostgreSQL order read failed with exit code $dbCode" }

$dbJsonLine = $dbOutput | Where-Object { $_ -match '^\{"id":' } | Select-Object -Last 1
if (-not $dbJsonLine) { throw "Source PostgreSQL order read did not return its JSON evidence." }
$dbOrder = $dbJsonLine | ConvertFrom-Json
$storeCurrency = ($smokeOutput | Where-Object { $_ -match "^${Label}_ORDER_CURRENCY=" } | Select-Object -Last 1) -replace "^${Label}_ORDER_CURRENCY=", ''
$storeCountry = ($smokeOutput | Where-Object { $_ -match "^${Label}_ORDER_COUNTRY=" } | Select-Object -Last 1) -replace "^${Label}_ORDER_COUNTRY=", ''
$storeTotal = ($smokeOutput | Where-Object { $_ -match "^${Label}_ORDER_TOTAL=" } | Select-Object -Last 1) -replace "^${Label}_ORDER_TOTAL=", ''
$storeNumber = ($smokeOutput | Where-Object { $_ -match "^${Label}_ORDER_NUMBER=" } | Select-Object -Last 1) -replace "^${Label}_ORDER_NUMBER=", ''

if ($dbOrder.id -ne $orderId -or $dbOrder.number -ne $storeNumber -or $dbOrder.currency.ToLowerInvariant() -ne $storeCurrency -or $dbOrder.country.ToLowerInvariant() -ne $storeCountry -or [decimal]$dbOrder.total -ne [decimal]$storeTotal) {
  throw "Source Store/Admin/PostgreSQL order evidence does not agree."
}

Write-Host "${Label}_DB_ORDER_ID=$($dbOrder.id)"
Write-Host "${Label}_DB_ORDER_NUMBER=$($dbOrder.number)"
Write-Host "${Label}_DB_CURRENCY=$($dbOrder.currency.ToLowerInvariant())"
Write-Host "${Label}_DB_COUNTRY=$($dbOrder.country.ToLowerInvariant())"
Write-Host "${Label}_DB_TOTAL=$($dbOrder.total)"
Write-Host "${Label}_DB_PAYMENT_METHOD=$($dbOrder.payment_method)"
Write-Host "${Label}_DB_PAYMENT_PROVIDER=$($dbOrder.payment_provider)"
Write-Host "${Label}_DB_SHIPPING_METHOD=$($dbOrder.shipping_method)"
Write-Host "${Label}_ORDER_DOUBLE_READ=PASS"
