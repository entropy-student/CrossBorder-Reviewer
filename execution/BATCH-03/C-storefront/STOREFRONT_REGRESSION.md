# BATCH-03 Storefront Regression

Environment: existing local production runtime started through
`03_template/medusa-crossborder-base/scripts/start-local.ps1`; no acceptance
smoke and no order placement were run.

| Surface | Result | Evidence |
|---|---|---|
| Backend `/health` | `PASS_LOCAL_ONLY` | HTTP 200 `OK` |
| `/us` | `PASS_LOCAL_ONLY` | HTTP 200; Pawfectly Home shell and current product marker |
| `/us/store` | `PASS_LOCAL_ONLY` | HTTP 200; product title/price and square asset marker; apparel copy absent |
| `/us/products/pet-hair-remover` | `PASS_LOCAL_ONLY` | HTTP 200; title, `14.99`, square asset and `Available to order` present |
| `/us/cart` | `PASS_LOCAL_ONLY` | HTTP 200; empty-cart route |
| `/us/checkout` without a cart | `PASS_LOCAL_ONLY` | guarded 404; no cart means no checkout progression |
| Store API product read-back | `PASS_LOCAL_ONLY` | canonical product ID, handle, title, SKU, image and `manage_inventory=false` |
| Customer PayPal exposure | `PASS_LOCAL_ONLY` | disabled customer-mode gate; no PayPal CTA/session |

The current page responses did not contain the preserved wide image path or
the seed apparel labels `Shirts`, `Sweatshirts` or `Pants`. The existing
BATCH-02 non-empty cart/Add-to-Bag read-only evidence remains the accepted
local commerce baseline; this batch created no order.
