# PayPal Local Integration Evidence

## Configuration gate

- `PAYPAL_PROVIDER_ENABLED=false` remains the safe default.
- Enabling requires sandbox client credentials, `PAYPAL_WEBHOOK_ID`, HTTPS
  return/cancel URLs on the same storefront origin, and
  `MEDUSA_CHECKOUT_INSTANCE_MODE=paypal_sandbox_test` matching storefront mode.
- Production environment and `PAYPAL_AUTO_CAPTURE=true` fail closed.
- Customer exposure remains disabled in the live local runtime.

## Persistent event inbox

- Module: `apps/backend/src/modules/paypal-reconciliation/`.
- Migration: `Migration20260907000100.ts`.
- Isolated PostgreSQL migration/read-back: `PASS`.
- Table: `public.paypal_event_inbox`.
- Unique provider-event index: `PASS`.
- Status index: `PASS`.
- Initial isolated row count: `0`.
- Webhook flow: provider signature verification -> PayPal event mapping ->
  reconciliation module -> inbox record. Missing reconciliation registration
  rejects acknowledgement.
- Replay path: read-before-create by hashed provider event ID. External replay,
  restart durability and concurrent delivery remain `SANDBOX_REQUIRED`.
- Stored data is restricted to hashed IDs, safe tails, event type,
  session/order correlation, amount/currency, status, timestamps and sanitized
  reason. Raw body, headers, token, secret and buyer PII are not persisted.

## Event classification

- Applied events: authorization created/voided, capture completed/declined,
  capture reversed/refunded and refund failed.
- Held events: capture pending, refund pending/completed and dispute events.
- `CHECKOUT.ORDER.APPROVED` and unknown events: not supported.
- `PAYMENT.CAPTURE.DECLINED` is canonical; `DENIED` is a legacy alias.
