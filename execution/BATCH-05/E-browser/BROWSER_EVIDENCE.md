# Browser Evidence

Tool: Codex In-app Browser against the existing local runtime
`http://127.0.0.1:18600`.

## Completed read-only/customer-flow checks

| Route/state | Result | Evidence |
|---|---|---|
| `/us` | PASS | Pawfectly Home, approved product, no apparel seed copy |
| `/us/store` | PASS | one approved product, `$14.99`, no seed apparel |
| `/us/products/pet-hair-remover` | PASS | title, `$14.99`, `Available to order`, Add to bag |
| non-empty cart | PASS | two line units, `$29.98`, no `$NaN` |
| mini-cart/cart access | PASS | Bag count `2`, product/variant/quantity/price/subtotal visible |
| `/us/checkout?step=address` | PASS | address form and order summary visible; Shipping/Taxes `Calculated at checkout` |

Current browser viewport readback was `619x616` CSS pixels, DPR `1.5`.
The CUA surface used for this run does not provide a controlled 320/375/768/
1440 viewport or persisted screenshot-file API. Therefore the requested full
viewport/200% zoom matrix and screenshot artifacts are `NOT_CAPTURED`, not
claimed PASS. No visual code change was made for this limitation.

No PayPal CTA was exposed in customer mode. No order was submitted.
