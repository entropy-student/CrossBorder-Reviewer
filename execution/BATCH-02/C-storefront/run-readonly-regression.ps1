$ErrorActionPreference = "Stop"
$template = (Resolve-Path "C:\Users\34707\Documents\ChatGPT\跨境电商\CrossBorder-Independent-Store\03_template\medusa-crossborder-base").Path
$storeEnv = Join-Path $template "apps/storefront/.env.local"
$publishable = ((Get-Content -LiteralPath $storeEnv | Where-Object { $_ -match "^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=" } | Select-Object -First 1) -replace "^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=", "").Trim()
$api = "http://127.0.0.1:19600"
$store = "http://127.0.0.1:18600"
$paths = @("/us", "/us/store", "/us/products/pet-hair-remover", "/us/cart")
$rows = @()
foreach ($path in $paths) {
  $tmp = Join-Path $env:TEMP ("batch02-route-" + [guid]::NewGuid().ToString("N") + ".html")
  $code = (& curl.exe --noproxy "*" -sS -o $tmp -w "%{http_code}" ($store + $path)).Trim()
  $body = [System.IO.File]::ReadAllText($tmp)
  Remove-Item -LiteralPath $tmp -Force
  $rows += [pscustomobject]@{
    PATH = $path
    HTTP = $code
    PRIVATE_METADATA = if ([regex]::IsMatch($body, "pawfectly_cost_price|bulk_shipping_quote|sourcing_gate_status|pawfectly_supplier|project_owned_inventory|source_fact_boundary|pawfectly_inventory_quantity")) { "FOUND" } else { "NONE" }
    SEED_COPY = if ([regex]::IsMatch($body, "Medusa Sweatshirt|Medusa T-Shirt|Medusa Pants|Medusa Shorts")) { "FOUND" } else { "NONE" }
    PRODUCT_IMAGE = if ($path -eq "/us/products/pet-hair-remover" -and $body.Contains("/assets/products/COMP-001-main-square.png")) { "FOUND" } else { "N/A" }
    PRICE = if ($path -eq "/us/products/pet-hair-remover" -and [regex]::IsMatch($body, "14\.99|14,99|1499")) { "FOUND" } else { "N/A" }
    TITLE = if ($path -eq "/us/products/pet-hair-remover" -and $body.Contains("Reusable Self-Cleaning Pet Hair Remover")) { "FOUND" } else { "N/A" }
    AVAILABILITY = if ($path -eq "/us/products/pet-hair-remover" -and $body.Contains("Available to order")) { "AVAILABLE_TO_ORDER" } elseif ($path -eq "/us/products/pet-hair-remover" -and $body.Contains("Currently unavailable")) { "CURRENTLY_UNAVAILABLE" } else { "N/A" }
    ADD_TO_BAG = if ($path -eq "/us/products/pet-hair-remover" -and $body.Contains("Add to bag")) { "FOUND" } else { "N/A" }
    SELECT_VARIANT = if ($path -eq "/us/products/pet-hair-remover" -and $body.Contains("Select variant")) { "FOUND" } else { "N/A" }
  }
}
$apiTmp = Join-Path $env:TEMP ("batch02-api-" + [guid]::NewGuid().ToString("N") + ".json")
$apiCode = (& curl.exe --noproxy "*" -sS -o $apiTmp -w "%{http_code}" -H ("x-publishable-api-key: " + $publishable) ($api + "/store/products?handle=pet-hair-remover&region_id=reg_01M1JFCMTE0655N7Y3XG8XZD8W&fields=*variants.calculated_price,*variants.metadata,*images,+metadata")).Trim()
$json = [System.IO.File]::ReadAllText($apiTmp) | ConvertFrom-Json
Remove-Item -LiteralPath $apiTmp -Force
$product = $json.products | Select-Object -First 1
$variant = $product.variants | Select-Object -First 1
$price = $variant.calculated_price.calculated_amount
$productRow = $rows | Where-Object { $_.PATH -eq "/us/products/pet-hair-remover" }
Write-Output "ROUTE_QA_BEGIN"
$rows | Format-Table -AutoSize | Out-String | Write-Output
Write-Output ("STORE_API_HTTP=" + $apiCode)
Write-Output ("STORE_API_PRODUCT=" + $product.id + "|" + $product.handle + "|" + $product.title)
Write-Output ("STORE_API_SKU=" + $variant.sku)
Write-Output ("STORE_API_PRICE=" + $price + "|" + $variant.calculated_price.currency_code)
Write-Output ("STORE_API_IMAGE=" + (($product.images | Select-Object -First 1).url))
Write-Output ("STORE_API_PUBLIC_METADATA=" + (($product.metadata | Get-Member -MemberType NoteProperty -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join ","))
Write-Output ("STORE_API_PRIVATE_METADATA_LEAK=" + [bool]($product.metadata.PSObject.Properties.Name | Where-Object { $_ -match "cost|supplier|sourcing|cross_border|physical|hs_code|provenance" }))
Write-Output ("PDP_AVAILABILITY=" + $productRow.AVAILABILITY)
Write-Output ("PDP_ADD_TO_BAG=" + $productRow.ADD_TO_BAG)
Write-Output ("PDP_SELECT_VARIANT=" + $productRow.SELECT_VARIANT)
Write-Output "ROUTE_QA_END"
