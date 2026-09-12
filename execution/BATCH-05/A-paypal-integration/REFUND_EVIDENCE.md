# PayPal Refund Evidence

- Refund transport read-back method exists and validates provider refund ID,
  amount and currency.
- Pending refund reconciliation path is fail-safe and does not synthesize
  completion.
- Local unit/contract fixtures cover bounded amounts, stable logical retry keys,
  distinct partial-refund identities and mismatch rejection.
- No real PayPal refund was executed in BATCH-05 because sandbox OAuth returned
  `401` before order creation.
- Provider read-back, `PENDING -> COMPLETED/FAILED`, concurrent partial refunds,
  cumulative provider enforcement and Medusa read-back remain
  `SANDBOX_REQUIRED`; local fixtures are not external payment evidence.

`MEDUSA_WRITE=NO` for refund/order operations in this batch.
