# Payment Phase

`SOURCE_BOUND=YES`; `HUMAN_WORKING_DOCUMENT=NO`. Current human-facing payment
contracts are maintained in the sibling document center under `payment/`.

Status: `FULL_REVIEW_CHECKPOINT_001=CLOSED`; `FULL_REVIEW_CHECKPOINT_002=CLOSED_FOR_REVIEW`; `BATCH_03=READY_FOR_REVIEW`.

The storefront/product baseline is accepted. No real payment provider is configured yet. The Medusa System Payment provider and local/manual shipping options are technical fixtures only; customer checkout hides them by default.

The active runtime contract is the Medusa Payment Module / `AbstractPaymentProvider`; the provider-neutral file in this folder is readiness/reference material only. WorldFirst is locked to `WORLDFIRST_COLLECTION_ACCOUNT` for the current account, so a separate checkout gateway is required. PayPal is the primary checkout-gateway candidate, subject to account and sandbox eligibility review. Neither provider is enabled in customer checkout. Any future integration must sit behind the Medusa payment boundary rather than replacing Medusa cart/order state or duplicating order ownership.

Current rules:

- `pp_system_default` remains available to direct API smoke tests only.
- Normal storefront default: `NEXT_PUBLIC_CHECKOUT_EXPOSURE_MODE=customer`.
- Explicit local UI smoke only: `NEXT_PUBLIC_CHECKOUT_EXPOSURE_MODE=technical_test`.
- No live secret belongs in Git, Review ZIPs, handoff documents, screenshots, or logs.
- `SETTLEMENT_PROVIDER=WORLDFIRST` and `WORLDFIRST_MODE=WORLDFIRST_COLLECTION_ACCOUNT`.
- `WORLDFIRST_GLOBAL_CHECKOUT=NOT_AVAILABLE_CURRENT_ACCOUNT / DEFERRED`; this is not a permanent business impossibility claim.
- `CHECKOUT_GATEWAY_REQUIRED=YES`; `PRIMARY_CHECKOUT_CANDIDATE=PAYPAL`.
- PayPal has a Medusa Payment Module scaffold with a fail-closed transport. The reviewed first path is AUTHORIZE-only (`PAYPAL_AUTO_CAPTURE=false`); reviewer evidence records sandbox OAuth success, while buyer approval, authorization/capture/refund, webhook and Medusa read-back remain external sandbox gates. Customer exposure remains disabled.
- Round-2 closure reconciles authorization/capture evidence through direct status/retrieve methods, uses the Payments v2 `PAYMENT.CAPTURE.DECLINED` event, rejects template credentials when enabled, bounds PayPal request IDs for supported operations, keeps Orders PATCH update identity local because the official PATCH contract does not define `PayPal-Request-Id`, and records the installed Medusa negative-webhook behavior as `IGNORED_BY_CORE`. These are local contract/source checks, not sandbox evidence.
- `06_payment/providers/worldfirst/` contains readiness contracts and placeholders only; it is not a live provider implementation.
- `06_payment/providers/paypal/` contains the PayPal scaffold contracts; its default transport is deliberately not a live provider implementation.
