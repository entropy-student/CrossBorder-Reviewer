# WorldFirst readiness layer

`SOURCE_BOUND=YES`; `HUMAN_WORKING_DOCUMENT=NO`. The current human-facing
WorldFirst contracts are maintained in the parent document center under
`../../../../payment/worldfirst/`.

Status: `SETTLEMENT_PROVIDER=WORLDFIRST` / `WORLDFIRST_MODE=WORLDFIRST_COLLECTION_ACCOUNT`.

The current confirmed account supports the collection-account settlement path.
The historical Global Checkout path remains documented for traceability but is
`NOT_AVAILABLE_CURRENT_ACCOUNT / DEFERRED`; that is not a permanent business
unavailability claim.

1. `WORLDFIRST_COLLECTION_ACCOUNT` — WorldFirst receives settlement funds from a separate payment gateway/acquirer, then handles FX/withdrawal. It does not provide customer card checkout by itself; `CHECKOUT_GATEWAY_REQUIRED=YES`.
2. `WORLDFIRST_GLOBAL_CHECKOUT` — retained as a deferred future acquiring/checkout path; it is not available on the current confirmed account.

The provider-neutral lifecycle is defined in `06_payment/providers/payment-provider-adapter.mjs`. The adapter is intentionally not wired to Medusa or the storefront yet. It fails closed with `PaymentProviderNotConfiguredError`; no fake success response is possible.

## Readiness rules

- No WorldFirst API was called in this task.
- No production or sandbox secret is committed.
- No real money is charged.
- `pp_system_default` remains a technical test-only fixture.
- Medusa remains the source of truth for cart, totals and order creation.
- `CHECKOUT_GATEWAY_REQUIRED=YES`; the primary checkout candidate is PayPal.
- A future provider transaction must map to the Medusa cart/payment-session/order and must not create a second order store.

Read the [WorldFirst integration contract](../../../../payment/worldfirst/WORLDFIRST_INTEGRATION_CONTRACT.md),
[capability matrix](../../../../payment/worldfirst/WORLDFIRST_CAPABILITY_MATRIX.md)
and [test matrix](../../../../payment/worldfirst/WORLDFIRST_TEST_MATRIX.md)
before any sandbox implementation.
