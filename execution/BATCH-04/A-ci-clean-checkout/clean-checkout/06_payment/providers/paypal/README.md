# PayPal readiness layer

`SOURCE_BOUND=YES`; `HUMAN_WORKING_DOCUMENT=NO`. The current human-facing
PayPal contracts are maintained in the parent document center under
`../../../../payment/paypal/`.

Status: `SCAFFOLD_IMPLEMENTED / R1_CONTRACT_CORRECTED / NOT_ENABLED`.

PayPal is the primary checkout-gateway candidate for the selected settlement
architecture:

```text
Customer -> Medusa / Pawfectly Home checkout -> PayPal transaction
         -> PayPal merchant balance -> WorldFirst Receiving Account -> FX/withdrawal
```

PayPal would own the external payment transaction, customer approval flow,
authorization/capture where supported, provider refund state and provider risk
signals. WorldFirst remains the receiving/settlement account; it is not the
customer checkout/acquiring provider in the current account mode.

## Evidence-based implementation path

`PAYPAL_IMPLEMENTATION_PATH=NEW_PAYPAL_ADAPTER_REQUIRED`.

The canonical Medusa project has no enabled customer-facing `pp_paypal`
provider, no customer PayPal callback/return flow and no reusable hosted
redirect adapter. The storefront display mapping is not an integration.

The Medusa Payment Module scaffold now lives at
`03_template/medusa-crossborder-base/apps/backend/src/modules/paypal/` and
implements the installed Medusa 2.19.0 `AbstractPaymentProvider` contract. It
uses a provider transport seam so the default runtime has no PayPal SDK client
and fails closed. Provider-level tests inject a fake transport only; no fake
success is registered in customer checkout.

The first reviewed path is `PAYPAL_PAYMENT_INTENT=AUTHORIZE` with
`PAYPAL_AUTO_CAPTURE=false`. Medusa payment-session IDs are opaque; capture
uses the returned authorization ID, and actionable Payments v2 webhooks are
restricted to authorization/capture payment events, including
`PAYMENT.CAPTURE.DECLINED` (the v1 `DENIED` spelling is legacy-only). Status
reconciliation requires authorization/capture evidence and never treats an
Order `COMPLETED` status alone as captured. These are local contract
corrections, not external sandbox evidence.

The current storefront exposure gate deliberately does not allow PayPal, so
the module scaffold cannot make it a usable customer payment option.

The scaffold follows the [official Medusa PayPal guide](https://docs.medusajs.com/resources/integrations/guides/paypal)
and the installed [Payment Provider contract](https://docs.medusajs.com/resources/commerce-modules/payment/payment-provider).
The official guide's server SDK transport is intentionally deferred until
merchant/sandbox eligibility is verified. The project remains locked to its
installed Medusa 2.19.0 dependencies; the active storefront separately uses
the approved Next.js 15.5.24 security patch.

## Eligibility and safety

- `PAYPAL_ACCOUNT_ELIGIBILITY=NEEDS_VERIFICATION`
- `PAYPAL_CARD_PROCESSING_ELIGIBILITY=NEEDS_VERIFICATION`
- `PAYPAL_SANDBOX_OAUTH=VERIFIED_BY_REVIEWER_BATCH_02`
- `PAYPAL_SANDBOX_ACCESS=NEEDS_VERIFICATION` (merchant/buyer transaction and
  webhook eligibility remain unverified)
- `PAYPAL_SANDBOX_PAYMENT_ENABLED=NO`
- `PAYPAL_LIVE_ACCESS=NO`
- `REAL_PAYMENT_ENABLED=NO`
- `REAL_PAYPAL_API_CALLED=OAUTH_PRECHECK_ONLY`
- `REAL_MONEY_CHARGED=NO`

Read the [capability](../../../../payment/paypal/PAYPAL_CAPABILITY_MATRIX.md),
[integration](../../../../payment/paypal/PAYPAL_INTEGRATION_CONTRACT.md),
[environment](../../../../payment/paypal/PAYPAL_ENV_CONTRACT.md) and
[test](../../../../payment/paypal/PAYPAL_TEST_MATRIX.md) contracts before
any sandbox implementation. Do not request or commit credentials in readiness
work.
