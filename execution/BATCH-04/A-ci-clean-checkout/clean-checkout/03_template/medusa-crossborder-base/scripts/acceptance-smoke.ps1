[CmdletBinding()]
param(
  [Nullable[int]]$DatabasePort,
  [Nullable[int]]$BackendPort,
  [Nullable[int]]$StorefrontPort,
  [string]$ProjectName
)

# MUTATING TEST: creates technical Medusa test orders. Not a read-only regression.

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

$settings = Resolve-TemplateSettings -DatabasePort $DatabasePort -BackendPort $BackendPort -StorefrontPort $StorefrontPort -ProjectName $ProjectName -RequireSavedConfig
$storefrontEnv = Read-KeyValueFile (Join-Path $script:StorefrontRoot ".env.local")
$credential = Read-KeyValueFile (Join-Path $script:RuntimeRoot "admin.local.txt")
if (-not $credential.email -or -not $credential.password) { throw "Template validation Admin credential is missing from .runtime." }
if (-not $storefrontEnv.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY) { throw "Template storefront publishable key is missing." }
$backendEnvPath = Join-Path $script:BackendRoot ".env"
if (-not (Test-Path -LiteralPath $backendEnvPath)) { throw "Backend runtime env is missing. Run setup-local.ps1 first." }
Set-TemplateComposeEnvironment $settings

$login = Invoke-LocalHttp -Method POST -Uri "http://127.0.0.1:$($settings.BackendPort)/auth/user/emailpass" -Body @{ email = $credential.email; password = $credential.password }
$adminToken = $login.Json.token
if (-not $adminToken) { throw "Admin authentication succeeded without a token." }
$adminHeaders = @{ Authorization = "Bearer $adminToken"; Accept = "application/json" }
$adminCheck = Invoke-LocalHttp -Method GET -Uri "http://127.0.0.1:$($settings.BackendPort)/admin/users/me" -Headers $adminHeaders
if ($adminCheck.StatusCode -ne 200) { throw "Authenticated Admin API verification failed." }
Write-Host "TEMPLATE_ADMIN_AUTH=PASS"

$sdkPath = Join-Path $script:StorefrontRoot "node_modules/@medusajs/js-sdk"
if (-not (Test-Path -LiteralPath $sdkPath)) { throw "Storefront Medusa SDK is missing." }
$smoke = Join-Path $PSScriptRoot "medusa-order-smoke.mjs"
$evidence = Join-Path $script:RuntimeRoot "evidence"
New-Item -ItemType Directory -Force -Path $evidence | Out-Null

function Invoke-MedusaSmoke([string]$Country, [string]$Currency, [string]$Label, [string]$Pattern) {
  $env:MEDUSA_BACKEND_URL = "http://127.0.0.1:$($settings.BackendPort)"
  $env:MEDUSA_PUBLISHABLE_KEY = $storefrontEnv.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  $env:MEDUSA_ADMIN_TOKEN = $adminToken
  $env:MEDUSA_SDK_PATH = $sdkPath
  $env:MEDUSA_SMOKE_COUNTRY = $Country
  $env:MEDUSA_SMOKE_CURRENCY = $Currency
  $env:MEDUSA_SMOKE_LABEL = $Label
  $env:MEDUSA_SMOKE_SHIPPING_PATTERN = $Pattern
  $env:NO_PROXY = "127.0.0.1,localhost"
  $env:no_proxy = $env:NO_PROXY
  $output = @(& node $smoke 2>&1)
  $exitCode = $LASTEXITCODE
  $output | Set-Content -LiteralPath (Join-Path $evidence ($Label + ".log")) -Encoding utf8
  $output | ForEach-Object { Write-Host $_ }
  if ($exitCode -ne 0) { throw ($Label + " smoke failed.") }
  $orderLine = $output | Where-Object { $_ -match ("^" + [regex]::Escape($Label) + "_ORDER_ID=") } | Select-Object -First 1
  if (-not $orderLine) { throw ($Label + " smoke did not return an order ID.") }
  $orderPrefix = $Label + "_ORDER_ID="
  $orderId = $orderLine.Substring($orderPrefix.Length).Trim()
  if ($orderId -notmatch '^order_[A-Za-z0-9]+$') { throw ($Label + " returned an invalid order ID.") }
  Write-Host ($Label + "_POSTGRES_READ=START")
  $container = (& docker compose -p $settings.ProjectName -f $script:ComposeFile ps -q postgres).Trim()
  if (-not $container) { throw "Template PostgreSQL container could not be resolved." }
  $safeId = $orderId.Replace("'", "''")
  $sql = 'SELECT o.id || ''|'' || lower(o.currency_code) || ''|'' || lower(COALESCE(a.country_code,'''')) || ''|'' || COALESCE((s.totals->>''current_order_total'')::numeric,0) FROM "order" o LEFT JOIN order_address a ON a.id=o.shipping_address_id LEFT JOIN order_summary s ON s.order_id=o.id WHERE o.id=''' + $safeId + ''';'
  $row = (($sql | & docker exec -i $container psql -U medusa -d medusa_dtc -At) -join "").Trim()
  if ($LASTEXITCODE -ne 0 -or -not $row) { throw ($Label + " PostgreSQL order re-read returned no row.") }
  $parts = $row.Split('|')
  if ($parts.Count -lt 4 -or $parts[0] -ne $orderId -or $parts[1] -ne $Currency.ToLowerInvariant() -or $parts[2] -ne $Country.ToLowerInvariant() -or [decimal]$parts[3] -le 0) {
    throw ($Label + " PostgreSQL evidence mismatch: " + $row)
  }
  Write-Host ($Label + "_POSTGRES_READ=PASS")
  return $orderId
}

$usOrder = Invoke-MedusaSmoke "US" "USD" "TEMPLATE_US_USD" "Test US Standard Shipping|US Standard Shipping"
$frOrder = Invoke-MedusaSmoke "FR" "EUR" "TEMPLATE_FR_EUR" "Test Standard Shipping|Standard Shipping"

foreach ($route in @("us", "us/store")) {
  $page = Wait-LocalHttp "http://127.0.0.1:$($settings.StorefrontPort)/$route" 30
  if ($page.Text -notmatch '(?i)(Pawfectly Home|Shop all|Better days|Objects worth keeping)') { throw "Storefront route did not contain Pawfectly storefront markers: /$route" }
  Write-Host "TEMPLATE_STOREFRONT_ROUTE_/$route=PASS"
}

Write-Host "TEMPLATE_US_USD_ORDER=$usOrder"
Write-Host "TEMPLATE_FR_EUR_ORDER=$frOrder"
Write-Host "TEMPLATE_ACCEPTANCE=PASS"
