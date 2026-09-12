$ErrorActionPreference = "Stop"
$template = "C:\Users\34707\Documents\ChatGPT\跨境电商\CrossBorder-Independent-Store\03_template\medusa-crossborder-base"
$envFile = Join-Path $template "apps/storefront/.env.local"
$key = ((Get-Content $envFile | Where-Object { $_ -match "^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=" } | Select-Object -First 1) -replace "^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=", "").Trim()
$api = "http://127.0.0.1:19600"
$regionId = "reg_01M1JFCMTE0655N7Y3XG8XZD8W"

function Invoke-StoreJson([string]$method, [string]$uri, $payload = $null) {
  $tmp = Join-Path $env:TEMP ("batch02-cart-" + [guid]::NewGuid().ToString("N") + ".json")
  $arguments = @("--noproxy", "*", "-sS", "-o", $tmp, "-w", "%{http_code}", "-X", $method, "-H", ("x-publishable-api-key: " + $key), "-H", "Content-Type: application/json")
  if ($null -ne $payload) { $arguments += @("--data-raw", ($payload | ConvertTo-Json -Depth 10 -Compress)) }
  $code = (& curl.exe @arguments $uri).Trim()
  $body = [System.IO.File]::ReadAllText($tmp)
  Remove-Item -LiteralPath $tmp -Force
  if ($code -notmatch "^2") { throw ("HTTP=" + $code + " URI=" + $uri + " BODY=" + $body.Substring(0, [Math]::Min(300, $body.Length))) }
  return [pscustomobject]@{ Code = $code; Body = ($body | ConvertFrom-Json) }
}

$product = (Invoke-StoreJson "GET" ($api + "/store/products?handle=pet-hair-remover&region_id=" + $regionId + "&fields=*variants.calculated_price,*variants.images,+metadata")).Body.products[0]
$variant = $product.variants[0]
$created = Invoke-StoreJson "POST" ($api + "/store/carts") @{ region_id = $regionId; currency_code = "usd" }
$cart = $created.Body.cart
$line = Invoke-StoreJson "POST" ($api + "/store/carts/" + $cart.id + "/line-items") @{ variant_id = $variant.id; quantity = 1 }
$cart = $line.Body.cart
$read = Invoke-StoreJson "GET" ($api + "/store/carts/" + $cart.id + "?fields=*items,*items.variant,*payment_collection.payment_sessions")
$cart = $read.Body.cart
$item = $cart.items[0]
$paymentProviders = Invoke-StoreJson "GET" ($api + "/store/payment-providers?region_id=" + $regionId)
$providerIds = @($paymentProviders.Body.payment_providers | ForEach-Object { $_.id })
$shippingOptions = Invoke-StoreJson "GET" ($api + "/store/shipping-options?cart_id=" + $cart.id)
$shippingNames = @($shippingOptions.Body.shipping_options | ForEach-Object { $_.name })
$rejectTmp = Join-Path $env:TEMP ("batch02-payment-reject-" + [guid]::NewGuid().ToString("N") + ".json")
$rejectCode = (& curl.exe --noproxy "*" -sS -o $rejectTmp -w "%{http_code}" -X POST -H ("x-publishable-api-key: " + $key) -H "Content-Type: application/json" --data-raw '{"provider_id":"pp_system_default"}' ($api + "/store/payment-collections/pc_batch02_probe/payment-sessions")).Trim()
Remove-Item -LiteralPath $rejectTmp -Force

Write-Output "CART_API_REGRESSION_BEGIN"
Write-Output ("NEW_ORDER_CREATED=NO")
Write-Output ("CART_ID=" + $cart.id)
Write-Output ("PRODUCT_ID=" + $product.id)
Write-Output ("VARIANT_ID=" + $variant.id)
Write-Output ("LINE_ITEM=" + $item.title + "|" + $item.quantity + "|" + $item.unit_price + "|" + $item.total)
Write-Output ("CART_SUBTOTAL=" + $cart.subtotal)
Write-Output ("CART_TOTAL=" + $cart.total)
Write-Output ("CURRENCY=" + $cart.currency_code)
Write-Output ("PAYMENT_PROVIDER_IDS=" + ($providerIds -join ","))
Write-Output ("SYSTEM_PAYMENT_EXPOSED_TO_CUSTOMER=" + [bool]($providerIds | Where-Object { $_ -like "pp_system_default*" }))
Write-Output ("SHIPPING_OPTION_NAMES=" + ($shippingNames -join ","))
Write-Output ("TECHNICAL_SHIPPING_EXPOSED_TO_CUSTOMER=" + [bool]($shippingNames | Where-Object { $_ -match "^Test |^US Standard Shipping$|^Standard Shipping$|^Express Shipping$" }))
Write-Output ("SYSTEM_PAYMENT_WRITE_REJECTED_HTTP=" + $rejectCode)
Write-Output "CART_API_REGRESSION_END"
