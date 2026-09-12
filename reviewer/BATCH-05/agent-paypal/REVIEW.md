# BATCH-05 PayPal / Medusa Independent Review

## Decision

`PAYPAL_LOCAL_UNIT_BASE=PASS`

`PAYPAL_FAIL_CLOSED_SANDBOX_ONLY=PASS`

`PAYPAL_STORE_API_VERTICAL=RETURN`

`PAYPAL_WEBHOOK_INBOX=RETURN`

`PAYPAL_REFUND_CONVERGENCE=RETURN`

`PAYPAL_SANDBOX=BLOCKED_HTTP_401`

The implementation is a useful sandbox-only scaffold, but it is not a
durable payment integration yet. It must remain disabled for customers.

## Independent evidence

- `corepack pnpm --dir apps/backend run test:unit`: 2 suites, 33/33 tests,
  exit 0. See `paypal-unit-tests.log`.
- One fixed-host OAuth recheck used only the Sandbox Client/Secret fields from
  the local data file. Redirects were disabled. Result: HTTP 401. No response
  body, token, credential, email, account value or full provider identifier was
  written. See `SANDBOX_OAUTH_RECHECK.json`.
- The two Sandbox credential fields are non-empty ASCII strings without
  whitespace or quote characters. This rules out the common local-copy shape
  errors but does not prove that the values belong to the same active Sandbox
  app. A Webhook ID is not used in OAuth, so the current 401 must be resolved at
  the Client/Secret/App level before Webhook-app consistency can be tested.
- `paypal-probes.ts` executes the actual project source. Its output is in
  `paypal-probes.log`.

## PASS findings

1. Fail-closed configuration is materially improved. Enabling PayPal requires
   non-placeholder Client/Secret/Webhook values, HTTPS return/cancel URLs on
   one origin, AUTHORIZE intent, no auto-capture, and the explicit
   `paypal_sandbox_test` backend mode
   (`apps/backend/src/modules/paypal/config.ts:36-84`). Production transport is
   rejected at lines 52-54 and again by provider validation at
   `service.ts:821-845`.
2. The provider and reconciliation module are registered only when
   `PAYPAL_PROVIDER_ENABLED=true`
   (`apps/backend/medusa-config.ts:68-98`). The current customer exposure
   remains disabled.
3. Signature verification is called before event mapping and Inbox invocation
   (`service.ts:1139-1154`). A missing reconciliation service rejects the event
   instead of acknowledging it (`service.ts:1144-1150`).
4. A real migration exists, and both the model and SQL declare provider event
   uniqueness (`paypal-event-inbox.ts:3-18`,
   `Migration20260907000100.ts:5-25`). The executor's isolated migration proof
   is consistent with the checked source.
5. Payments v2 capture/authorization events lacking `custom_id` can retrieve
   the related order and validate resource ID, amount and currency before
   returning a Medusa action (`service.ts:714-770`).

## RETURN findings

### P0 — Verified event replay is not suppressed

`recordVerifiedWebhookEvent` returns `{ replayed: true }` for an existing event
(`paypal-reconciliation/service.ts:46-48`), but
`getWebhookActionAndData` ignores that return value and always returns the
original Medusa action (`paypal/service.ts:1151-1155`). The executable probe
delivered one authorization event twice; both calls returned `authorized` and
`replay_suppressed=false`. Medusa documents that an `authorized` or `captured`
return causes its payment workflow to update the session and potentially
complete the cart. Inbox uniqueness alone therefore does not make the business
action idempotent.

Required change: atomically claim a verified Inbox row; only the claimant may
dispatch the action. A duplicate must return a no-op or read the already
converged Medusa state. Add concurrent duplicate-delivery and restart tests
through the actual webhook endpoint.

### P0 — Inbox records `applied` before Medusa applies the action

The Inbox maps `authorized`/`captured` directly to `applied` and writes
`applied_at` (`paypal-reconciliation/service.ts:35-39,50-77`). However,
`getWebhookActionAndData` performs this write before returning the action to
Medusa (`paypal/service.ts:1151-1155`); Medusa applies the action only after the
provider method returns. A process failure after line 1154 leaves a false
`applied` audit record, and a retry is not suppressed correctly.

Required change: persist `verified/claimed` first, dispatch through a durable
workflow, and mark `applied` only after Store/Payment state read-back proves the
transition. If the out-of-box webhook route must remain, store
`dispatch_requested` and reconcile the final state asynchronously rather than
claiming success early.

### P0 — Mapping failures occur before persistence

The sequence is verify -> resolve/map -> persist (`paypal/service.ts:1139-1154`).
Any verified event that fails related-resource lookup or validation is thrown
away before the Inbox can retain it. This defeats the Inbox's forensic and
retry purpose. The official-like refund probe is one concrete instance.

Required change: after successful signature verification, minimally validate
and persist the provider event ID/type/resource reference as `verified`; then
perform correlation and mapping. Record sanitized failure state on lookup or
validation errors.

### P0 — Official capture correlation is not saved in the Inbox

For a Payments v2 capture without `custom_id`, `resolvePayPalWebhookAction`
retrieves the order and injects the trusted session ID into a temporary mapped
payload (`paypal/service.ts:739-770`). But the reconciliation call receives the
original `webhookData.data` (`service.ts:1151-1153`). The Inbox derives
`medusa_session_id` only from the original resource's `custom_id`/`invoice_id`
(`paypal-reconciliation/service.ts:25-30,50-56`).

The executable official-capture probe returned `captured` with the resolved
session ID while `persisted_event_has_correlation=false`.

Required change: pass the verified mapped correlation/resource/order evidence
to the Inbox explicitly; never ask the Inbox to re-derive it from the original
resource alone.

### P0 — Refund webhook shapes cannot converge

`PAYMENT.REFUND.PENDING/COMPLETED/FAILED` are listed, but correlation fallback
requires `supplementary_data.related_ids.order_id`
(`paypal/service.ts:603-615,739-740`). A Payments v2 refund resource is related
to a capture and may expose `related_ids.capture_id`; the project's refund POST
sends only `amount` and does not attach `custom_id` or `invoice_id`
(`paypal/transport.ts:191-195`). The executable refund probe used
`related_ids.capture_id`; it was rejected before any provider lookup or Inbox
write with `requires_order_id_for_refund_resource`.

Even when direct correlation exists, refund pending/completed events return
`not_supported` and remain held (`paypal/service.ts:689-701`), while the CLI is
only a JSON-printing placeholder and never reads PayPal, the Inbox, or Medusa
(`apps/backend/scripts/paypal-reconcile.mjs:14-26`). There is no worker that
converges `PENDING -> COMPLETED/FAILED`, updates the durable Medusa Refund, or
resolves reversal/dispute states.

Required change: resolve refund -> capture -> PayPal order -> Medusa payment,
or persist a durable refund/capture/session mapping when the refund is created.
Implement a real worker/reconciliation workflow with provider and Medusa
read-back. Cover refund completed, pending, failed, capture partially refunded,
capture reversed, and disputes.

### P1 — Refund concurrency is only partially protected

The provider uses `payment.data.refund_operations` and `refunded_amount` as its
local retry ledger (`paypal/service.ts:968-1046`). Different concurrent partial
refunds start from the same payment data and return independently merged maps;
a last writer can lose an operation entry or cumulative provider-data value.
Medusa's durable Refund rows may bound the total, but no actual module/DB test
proves the final PayPal + Refund rows + `payment.data` state under concurrency,
provider success followed by local timeout, or delayed failure.

Required change: treat Medusa Refund/Capture records plus provider read-back as
the source of truth. Test two distinct concurrent partial refunds, same logical
retry, provider-success/local-timeout recovery, restart, and failed pending
refund. Assert final total and every operation in both systems.

### P1 — Store API integration is unproven and the region lacks PayPal setup

The repository contains only two unit suites; no `integration:http` PayPal test
exists. The storefront does call the native Initialize Payment Session route,
and Medusa 2.19 injects `session_id` into provider data, so the static call shape
is plausible. But OAuth 401 prevented actual provider construction/session
creation, and seed scripts register only `pp_system_default`
(`apps/backend/src/migration-scripts/initial-data-seed.ts:106` and
`scripts/medusa-crossborder-augment.ts:22`). There is no reviewed idempotent
Sandbox-region assignment for `pp_paypal_paypal`.

Required change: in an isolated database, enable the provider, migrate, assign
it to a Sandbox-only region, then test payment-provider listing, payment-session
creation/read-back, approval URL, return, authorization, cart completion and
Inbox linkage through real Store and webhook HTTP routes. Do not mutate the
current business database for this proof.

### P1 — Webhook verification ignores the raw request bytes

The provider receives `rawData`, but the HTTP transport posts
`webhook_event: payload.data` and never uses `payload.rawData`
(`paypal/transport.ts:205-209`). The existing unit test only proves that the
wrapper passes the payload object to a mock; it does not exercise the real
transport. PayPal's verification documentation cautions that the webhook event
must be posted back exactly as received and that parse/re-serialize changes can
break verification.

Required change: follow the exact PayPal verification contract for the runtime
body and add a transport-level fixture/test using the raw HTTP payload and real
header normalization. The Sandbox vertical must demonstrate an actual
`SUCCESS` verification.

## Sandbox 401 disposition

The updated local file does not clear the blocker. The one authorized fixed
Sandbox OAuth request still returned HTTP 401 without redirect. Since Webhook
ID is not part of OAuth, no conclusion about all three values belonging to the
same app is possible. The operator should regenerate/copy the current Sandbox
app secret in PayPal Developer Dashboard, keep Client ID and Secret from that
same Sandbox app, and separately copy that app's Sandbox Webhook ID into the
ignored runtime. The next executor should first run only the fixed-host OAuth
preflight; transaction work starts only after HTTP 200.

## Reviewer gate

Keep `PAYPAL_PROVIDER_ENABLED=false` and customer PayPal hidden. Return for a
single corrective batch containing:

1. Inbox claim/replay semantics and honest post-application state.
2. Persistence before correlation/mapping with saved resolved correlation.
3. Real refund/capture/order correlation and a functional reconciliation
   worker.
4. Isolated DB + real Store/webhook HTTP integration tests.
5. One Sandbox authorization/capture/partial-refund/webhook/read-back vertical
   after OAuth 200.

No Live endpoint, real charge, production credential, current database reset,
or customer exposure is authorized.

## Primary references

- PayPal webhook verification and official capture shape:
  https://developer.paypal.com/api/rest/webhooks/rest/
- PayPal Payments v2 related identifiers:
  https://developer.paypal.com/api/payments/v2/definitions/supplementary_data/
- PayPal refund integration:
  https://developer.paypal.com/checkout/refund-payment
- Medusa payment webhook behavior:
  https://docs.medusajs.com/resources/commerce-modules/payment/webhook-events
