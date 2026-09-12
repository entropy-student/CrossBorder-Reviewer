# BATCH-04 User Action Packet

This is the single consolidated input list for the remaining business,
provider, infrastructure, and release decisions. Existing PayPal OAuth/App
data was not requested again and is not reproduced here.

## Required decisions / inputs

| Input | Current state | Recommended default | Why it matters |
|---|---|---|---|
| Production hosting, backend, Postgres, Redis/queue, object storage, storefront host | `USER_DECISION_REQUIRED` | Managed services with backups, private DB/Redis networking, and separate staging/live environments | Determines deployment topology, recovery, and secrets boundary. |
| Domain and DNS control | `USER_DECISION_REQUIRED` | Choose the production domain and retain DNS administrator access | Required for HTTPS, PayPal return/webhook URLs, email, and launch rollback. |
| Production support and sender email | `USER_DECISION_REQUIRED` | A monitored support inbox plus verified sender domain | Required for customer support, order notices, disputes, and provider review. |
| PayPal Business live eligibility and live App | `USER_DECISION_REQUIRED` | Confirm Business account/KYC and request live App approval in PayPal dashboard; put secrets only in the production secret manager | Required before live customer exposure. Never paste secrets into chat or Git. |
| Fulfillment model / owned inventory | `USER_DECISION_REQUIRED` | Decide project-owned stock or a documented supplier-to-US-consumer flow | Current product is only `LOCAL_PREVIEW_AVAILABILITY`; supplier stock is not owned inventory. |
| Package weight, package dimensions, origin, HS/compliance evidence | `USER_DECISION_REQUIRED` | Obtain supplier/export evidence and verify before charging or shipping | Needed for real shipping/tax/fulfillment assumptions. |
| Carrier/service, shipping rates, delivery promise | `USER_DECISION_REQUIRED` | Select carrier/services and configure measured rates only | Prevents unsupported cost/SLA claims. |
| Return address and refund/dispute owner | `USER_DECISION_REQUIRED` | Name one operating owner and one return destination | Required for refunds, disputes, customer communication, and fulfillment holds. |
| Tax, privacy, terms, shipping and return policy owner | `USER_DECISION_REQUIRED` | Assign legal/business owner and jurisdictional review | Required before public launch; do not invent policy text or tax treatment. |

## Recommended order and rollback

1. Resolve infrastructure, domain/email, policy, inventory/fulfillment, and
   PayPal Business live eligibility inputs.
2. Clear dependency high findings and rerun the complete CI/security gate.
3. Run one isolated PayPal sandbox vertical transaction with buyer approval,
   authorize, capture, refund, webhook verification, and Medusa read-back.
4. Configure live credentials only in the production secret manager, keep the
   customer gate closed, and perform a controlled provider review.
5. Enable production checkout only after provider, shipping, tax, fulfillment,
   policy, and rollback checks are approved.

Rollback point: keep `PAYPAL_PROVIDER_ENABLED=false` and customer exposure
disabled, stop at checkout before payment, and preserve the existing Medusa
cart/order database and published product. No rollback should reset the
database or delete historical orders.

`USER_ACTION_PACKET_STATUS=READY_FOR_USER_DECISION`
