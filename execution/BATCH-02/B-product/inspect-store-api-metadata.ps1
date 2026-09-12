$ErrorActionPreference = "Stop"
$template = "C:\Users\34707\Documents\ChatGPT\跨境电商\CrossBorder-Independent-Store\03_template\medusa-crossborder-base"
$envFile = Join-Path $template "apps/storefront/.env.local"
$key = ((Get-Content $envFile | Where-Object { $_ -match "^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=" } | Select-Object -First 1) -replace "^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=", "").Trim()
$tmp = Join-Path $env:TEMP ("batch02-api-" + [guid]::NewGuid().ToString("N") + ".json")
$code = (& curl.exe --noproxy "*" -sS -o $tmp -w "%{http_code}" -H ("x-publishable-api-key: " + $key) "http://127.0.0.1:19600/store/products?handle=pet-hair-remover&region_id=reg_01M1JFCMTE0655N7Y3XG8XZD8W&fields=*variants.metadata,+metadata").Trim()
$product = ((Get-Content $tmp -Raw) | ConvertFrom-Json).products[0]
Remove-Item -LiteralPath $tmp -Force
Write-Output ("HTTP=" + $code)
foreach ($keyName in @("pawfectly_cost_price", "pawfectly_supplier_url", "bulk_shipping_quote", "pawfectly_store_integration_approved_by_user", "project_owned_inventory")) {
  $property = $product.metadata.PSObject.Properties[$keyName]
  Write-Output ($keyName + "=" + $(if ($null -eq $property) { "<MISSING>" } else { [string]$property.Value }))
}
$variant = $product.variants[0]
Write-Output ("VARIANT_MANAGE_INVENTORY=" + $variant.manage_inventory)
Write-Output ("VARIANT_ALLOW_BACKORDER=" + $variant.allow_backorder)
Write-Output ("VARIANT_INVENTORY_QUANTITY=" + $variant.inventory_quantity)
Write-Output ("VARIANT_OPTIONS=" + (($variant.options | ConvertTo-Json -Compress)))
foreach ($keyName in @("pawfectly_cost_price", "pawfectly_storefront_purchasable")) {
  $property = $variant.metadata.PSObject.Properties[$keyName]
  Write-Output ("variant." + $keyName + "=" + $(if ($null -eq $property) { "<MISSING>" } else { [string]$property.Value }))
}
