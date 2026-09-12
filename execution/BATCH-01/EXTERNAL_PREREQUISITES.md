# BATCH-01 External Prerequisites

This is a read-only inventory of non-code conditions for later runtime,
sandbox and production work. No credentials were requested, printed or added;
runtime secret values were not inspected or packaged, and no external payment
or logistics API was called.

| Area | Evidence available now | Missing fact / decision | Latest blocking phase |
|---|---|---|---|
| Settlement and checkout | `PAYMENT_ARCHITECTURE.md` records `WORLDFIRST_COLLECTION_ACCOUNT`; PayPal is a disabled `AUTHORIZE` candidate; Global Checkout is unavailable for the current account and deferred. | Confirm PayPal Business account eligibility, supported markets/currencies and sandbox access. | `PAYPAL_ACCOUNT_SANDBOX_CAPABILITY` |
| Payment operations | PayPal scaffold and Medusa Payment Module boundary exist; customer exposure is disabled; System Payment is technical-test-only. | Sandbox transport evidence for authorization, capture, failure, webhook, refund and reconciliation; no live access. | `PAYPAL_SANDBOX_TRANSPORT_INTEGRATION`, then pre-live readiness |
| Product inventory | The normalized product records supplier stock claim `AVAILABLE` and project-owned inventory `UNKNOWN`; local preview availability is explicitly not production stock. | Confirm owned stock/warehouse model, replenishment and purchasability policy. | Before production catalog launch |
| Fulfillment and logistics | COMP-001 retains supplier-claimed bulk DDP facts; consumer dropship support, package facts, origin and logistics readiness remain unknown/unverified. | Choose fulfillment route, verify packaging/weights/origin/HS handling, carrier rates, tracking, returns and reship rules. | Before production shipping and go-live |
| Domain/deployment | `deployment/README.md` marks deployment deferred; no public deployment is configured by this batch. | Choose host, domain, HTTPS, process model, secrets, deploy/rollback and monitoring ownership. | Before public launch |
| Email/customer support | `PRODUCTION_READINESS.md` requires transactional email, sender-domain authentication and support/contact readiness; none was configured here. | Select email provider/domain, verify delivery and publish support contact/process. | Before real traffic/orders |
| Customer policies | Production-readiness evidence calls for privacy, terms, shipping, refund/return and contact policies. | Approve market-specific customer-facing policies and return address/rules. | Before real traffic/orders |
| Tax/customs | Tax collection, declared value, duties/import-tax and restricted-goods handling are explicitly deferred. | Obtain tax/legal decision and configure reviewed production rules. | Before production sales |
| Backups/recovery | Production-readiness evidence requires managed PostgreSQL backups/PITR and a tested restore/rollback path; this batch did not alter local Docker data. | Select backup owner/retention/PITR and perform a restore/rollback exercise. | Before production launch |

## Boundary

These are prerequisites and decisions, not reasons to change the frozen UI,
product choice, payment architecture or local database in BATCH-01. The batch
does not claim any external eligibility, production inventory, carrier rate,
domain, policy, backup or payment capability that is not evidenced above.
