# BATCH-05 Execution Report

## Executor status

`BATCH-05=PARTIAL/BLOCKED`
`READY_FOR_REVIEW=YES`

The local implementation and read-only runtime gates that did not require
external PayPal credentials were completed. The one authorized sandbox
vertical could not start because the current local sandbox OAuth preflight
returned HTTP 401. The browser viewport/zoom matrix also could not be fully
captured by the available CUA surface. Executor does not declare Reviewer
PASS.

## Scope preserved

- Product unchanged: `prod_01M1JG54Z6PFY802QV32EJ174D`,
  `PAW-PHR-001`, handle `pet-hair-remover`, `14.99 USD`.
- Existing product image, catalog identity, database, Docker volume and
  historical order count were not reset or deleted.
- No Live Secret was read, used, copied or stored.
- No WorldFirst API, live PayPal API or real money was used.
- No new Medusa business order was created by this batch.
- PayPal customer exposure remains disabled.

## Completed local work

- Fail-closed PayPal sandbox config and return/cancel/mode consistency gate.
- Persistent `paypal_event_inbox` module, migration and actual provider webhook
  seam; isolated PostgreSQL migration/read-back proved the table and unique
  provider-event index.
- Replay-aware reconciliation service and dry-run reconcile CLI.
- Provider refund read-back contract and pending-safe reconciliation path.
- Idempotent inventory plan with read-before-create/update shape and tests;
  production inventory write remained disabled.
- Public catalog projection and Store API route boundary with metadata
  sanitization tests.
- Windows + Linux CI workflow, CSP correction, lint/typecheck/build scripts,
  deployment preparation artifacts and host decision record.
- Storefront monetary compatibility fix removed `$NaN`; browser cart now shows
  `$29.98` for the existing two-unit local cart, with pending shipping/tax
  displayed as `Calculated at checkout`.
- PayPal event classification now distinguishes applied events from held
  pending/refund/dispute events instead of labeling held events actionable and
  silently returning `not_supported`.

## Validation results

| Gate | Result |
|---|---|
| TypeScript | PASS, exit 0 |
| Backend PayPal/unit/contracts | PASS, 33/33, exit 0 |
| Inventory plan test | PASS, exit 0; `MEDUSA_WRITE=NO` |
| Lint | PASS, exit 0 |
| Production build | PASS, exit 0; Next.js 15.5.24 |
| Local backend health | PASS, HTTP 200 |
| Storefront `/us`, `/us/store`, PDP | PASS, HTTP 200 |
| Admin/Store API product read-back | PASS |
| PostgreSQL product/order read-only read-back | PASS; order count remained 2 |
| PayPal OAuth preflight | BLOCKED, sandbox HTTP 401 |
| PayPal sandbox order/authorize/capture/refund/webhook | NOT ATTEMPTED after OAuth block |
| Browser cart/checkout entry | PASS at 619x616; no order submitted |
| Full 320/375/768/1440 + 200% browser matrix | NOT_CAPTURED by available browser surface |
| Dependency audit | 0 critical / 0 high / 1 moderate / 0 low |

## External transaction truth

`SANDBOX_ORDER_CREATED=NO`
`BUYER_APPROVAL=NOT_ATTEMPTED`
`AUTHORIZATION=NOT_ATTEMPTED`
`CAPTURE=NOT_ATTEMPTED`
`REFUND=NOT_ATTEMPTED`
`WEBHOOK_DELIVERY=NOT_ATTEMPTED`
`REAL_MONEY_CHARGED=NO`

## Remaining gates

1. Confirm a valid current PayPal Sandbox app/client/Webhook ID in the ignored
   local runtime; no Live Secret should be supplied or reused.
2. Reviewer-authorize one sandbox transaction after the OAuth gate is green,
   then prove approval, authorization by ID, capture, partial refund,
   webhook/inbox and Medusa read-back.
3. Complete controlled browser 320/375/768/1440 and 200% zoom/a11y evidence.
4. Reviewer decides the one moderate transitive AJV advisory and backend-host
   option before any production payment/deployment work.

See `USER_ACTION_PACKET.md` for the single combined user action.
