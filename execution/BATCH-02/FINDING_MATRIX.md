# BATCH-02 Finding Matrix

Status vocabulary: `CLOSED_LOCAL` means the local assertion is complete;
`PASS_LOCAL_ONLY` means external proof is still required;
`BLOCKED_EXTERNAL` means the task stopped safely at an external prerequisite;
`NOT_RUN` means intentionally outside this batch.

| Area | Finding / acceptance | Status | Evidence |
|---|---|---|---|
| A | RT-02 stale/incorrect process ownership and PID reuse | CLOSED_LOCAL | `A-runtime-ci/runtime-security-unified.log` |
| A | RT-03 wrong listener reuse and controlled-service stop safety | CLOSED_LOCAL | same |
| A | RT-04 build/typecheck must stop after injected failure | CLOSED_LOCAL | same |
| A | RT-01 staging path/marker/reparse protection | CLOSED_LOCAL | same; symbolic-link case explicitly skipped |
| A | Clean external CI checkout | BLOCKED_EXTERNAL | `EXTERNAL_PREREQUISITES.md` |
| B | Public product metadata boundary | CLOSED_LOCAL | `B-product/store-api-metadata-values-final.log` |
| B | Existing product same-ID upsert, all-variant read-back, idempotence | CLOSED_LOCAL | `B-product/product-upsert-public-metadata-final-scrub.log` |
| B | Product/component validation and no invented facts | CLOSED_LOCAL | `B-product/product-contracts.log` |
| C | Real product route/PDP/cart read-only regression | CLOSED_LOCAL | `C-storefront/storefront-readonly-regression-final.log` |
| C | Cart line and total from real Store API | CLOSED_LOCAL | `C-storefront/cart-api-regression-final.log` |
| C | Customer-mode technical payment/shipping boundary | CLOSED_LOCAL | same cart log; HTTP 403 technical write rejection |
| C | Real customer payment checkout | BLOCKED_EXTERNAL | PayPal disabled; sandbox required |
| D | PayPal local provider contract and money/refund guards | PASS_LOCAL_ONLY | `D-payment/paypal-unit.log` |
| D | PayPal sandbox authorize/capture/refund/webhook recovery | BLOCKED_EXTERNAL | no app credentials/merchant sandbox proof |
| E | PayPal credential/category preflight | BLOCKED_EXTERNAL | `E-paypal-preflight/PRE_FLIGHT_SANITIZED.md` |

No row authorizes customer PayPal exposure, production money movement, a new
order, or a launch decision.
