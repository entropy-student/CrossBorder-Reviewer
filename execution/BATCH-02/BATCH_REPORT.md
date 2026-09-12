# BATCH-02 Execution Report

STATUS=BATCH-02_READY_FOR_REVIEW
DATE=2026-09-06
CANONICAL_WORKSPACE=C:\\Users\\34707\\Documents\\ChatGPT\\跨境电商
CANONICAL_SOURCE=C:\\Users\\34707\\Documents\\ChatGPT\\跨境电商\\CrossBorder-Independent-Store
APPLICATION=03_template/medusa-crossborder-base

This is an execution handoff, not a Reviewer PASS. The working trees remain
uncommitted so the independent Reviewer can inspect the complete diff. Existing
BATCH-01 changes were preserved and are distinguished in the evidence where
possible.

## A — Runtime, process ownership, CI

- RT-02 process identity: PASS (9/9 assertions).
- RT-03 service identity and safe reuse: PASS (7/7 assertions).
- RT-04 injected failure gates: PASS; the unified gate rejected both injected
  failures and did not continue to build.
- RT-01 staging safety: PASS (37 assertions, one symbolic-link case skipped
  because elevation was not requested).
- `corepack pnpm@10.11.1 run verify`: exit 0. The final log includes the
  contract, product/component, runtime security and PayPal unit gates.
- `corepack pnpm@10.11.1 run verify:build`: exit 0. Backend and storefront
  production builds completed. Existing lint warnings remain; there were no
  build errors.
- Remote clean-checkout CI was not executed in this local run. Its evidence
  still requires an external CI environment containing the required fixtures
  and dependency/network access.

Evidence: `A-runtime-ci/runtime-security-unified.log`,
`A-runtime-ci/pnpm-verify-final.log`, `A-runtime-ci/pnpm-build-final.log`.

## B — Product boundary and existing Medusa product

- Product and component contract tests: PASS.
- Public Store API/product serialization is allow-listed; supplier, cost,
  procurement and other private metadata are not exposed.
- The existing product was updated in place only:
  `prod_01M1JG54Z6PFY802QV32EJ174D`, handle `pet-hair-remover`, SKU
  `PAW-PHR-001`, published, USD 14.99.
- Same-product upsert and rerun: PASS; product count delta 0, duplicate
  variants 0. Admin, Store API and PostgreSQL read-back matched.
- The local write was limited to the existing product metadata/read-back
  correction plus ephemeral local cart QA state; no catalog reset, order
  mutation or new product was performed.
- Source image remains the approved square asset. Private legacy metadata was
  scrubbed from this same product; public storefront metadata remains.

Evidence: `B-product/product-contracts.log`,
`B-product/product-upsert-public-metadata-final-scrub.log`,
`B-product/store-api-metadata-values-final.log`.

## C — Storefront/account/cart/checkout recovery

- Read-only route regression: `/us`, `/us/store`, real PDP and `/us/cart`
  returned HTTP 200. PDP showed the real title, image, USD 14.99 and
  `Available to order`.
- Cart API regression used the real product and created no order. Line item,
  quantity 1, subtotal and total were 14.99 USD.
- Customer-mode backend boundary hides technical System Payment and technical
  shipping options; a technical payment-session write was rejected with HTTP
  403. System Payment remains technical-test-only.
- Cart reads distinguish a missing cart from service failure, use no-store for
  transactional reads, and place-order cleanup is explicit.
- Payment initialization/add-to-cart errors restore controls and surface retry
  state. Account/order reads use transactional freshness. Transfer decisions
  are POST form actions rather than GET mutations.
- No order was placed. Full customer PayPal checkout was intentionally not
  exposed because the provider is disabled and sandbox credentials/eligibility
  were not established.

Evidence: `C-storefront/storefront-readonly-regression-final.log`,
`C-storefront/cart-api-regression-final.log`.

## D — Payment contract and technical boundary

- PayPal provider local unit contract: 22/22 PASS.
- Provider remains disabled; no PayPal or WorldFirst API was called and no
  money was charged.
- PayPal scaffold preserves Medusa Payment Module as the runtime authority,
  uses fail-closed production behavior, operation-scoped refund identity,
  amount/currency checks, authorization/capture evidence and local replay
  protection.
- Customer exposure remains disabled. The backend boundary also prevents the
  technical System Payment from being exposed or created in customer mode.
- Real webhook persistence/reconciliation, sandbox authorization/capture/
  refund, and external replay behavior remain sandbox-required and are not
  claimed as proven by mocks.

Evidence: `D-payment/paypal-unit.log`, `E-paypal-preflight/`.

## E — PayPal preflight

The local file supplied for preflight was read only in-process. It contained
account/login-style material but no unambiguous REST sandbox Client ID,
Client Secret and Webhook ID tuple. OAuth was therefore not attempted. No
secret value, token, response body or credential was copied into source or
evidence.

`PAYPAL_PRE_FLIGHT=BLOCKED_INPUT_CATEGORY_NOT_APP_CLIENT_CREDENTIALS`
`SANDBOX_OAUTH_CALL=NOT_ATTEMPTED`
`CUSTOMER_EXPOSURE=DISABLED`

## Safety boundary

`NEW_ORDER_CREATED=NO`
`LOCAL_QA_CARTS_CREATED=YES`
`DATABASE_RESET=NO`
`REAL_PAYPAL_API_CALLED=NO`
`REAL_WORLDFIRST_API_CALLED=NO`
`REAL_MONEY_CHARGED=NO`
`PAYPAL_CUSTOMER_EXPOSURE=DISABLED`

Open external prerequisites are listed in `EXTERNAL_PREREQUISITES.md`.
The executor stops here for independent review and does not declare product,
payment or production launch PASS.

The evidence scan found no real credential, token, password or key. The only
token-shaped match is the literal `fixture-token` in a local mocked transport
fixture inside the complete diff; it is not a runtime secret and was not used
against PayPal.
