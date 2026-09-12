# BATCH-03 External Prerequisites

The current human-facing source is:

- `跨境电商/operations/EXTERNAL_PREREQUISITES.md`
- `跨境电商/operations/FULFILLMENT_READINESS.md`

Verified local facts: the real product identity and `14.99 USD` baseline are
unchanged; the Medusa Payment Module scaffold is disabled; local typecheck,
lint, contract/unit/security tests and production build pass.

External blockers remain:

- PayPal buyer approval, authorization/capture, decline/retry, refund,
  webhook/replay and Medusa read-back sandbox evidence;
- merchant/production eligibility, Webhook ID and isolated repeatable CI;
- project-owned inventory, fulfillment route, package/origin/compliance facts,
  returns/refunds ownership, taxes, domain, email, policy and recovery facts.

WorldFirst remains a collection/settlement account, not a customer checkout
adapter. Customer PayPal exposure and automatic fulfillment remain disabled.
