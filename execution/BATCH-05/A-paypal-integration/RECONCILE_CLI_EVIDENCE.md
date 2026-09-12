# Reconciliation CLI Evidence

`apps/backend/scripts/paypal-reconcile.mjs` was inspected as a dry-run-only
reconciliation seam. It requires an explicit sandbox/isolated context for
future mutation, never calls PayPal in its default mode, and does not create a
Medusa order. No replay mutation was run against the current database.

`DRY_RUN=YES`
`CURRENT_DATABASE_MUTATED=NO`
`ORDER_CREATED=NO`
