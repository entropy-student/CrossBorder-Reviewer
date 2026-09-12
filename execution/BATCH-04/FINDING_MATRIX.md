# BATCH-04 Finding Matrix

| BATCH-03 finding / BATCH-04 requirement | Closure evidence | Truthful state |
|---|---|---|
| CI must build without a local backend | Dynamic/static fallback, Windows workflow, clean checkout logs | `LOCAL_CONTRACT_PASS`; remote GitHub Actions `NOT_RUN_REMOTE` |
| Real Medusa payment-session identity | Existing opaque session handling plus PayPal service tests | `LOCAL_CONTRACT_PASS`; no isolated Store API payment-session fixture created |
| Customer PayPal path and safe return | Explicit `paypal_sandbox_test` gate, allowlisted sandbox return, server-side cart/session correlation | `SCAFFOLD_ONLY`; customer default remains disabled |
| Payments v2 webhook correlation | `supplementary_data.related_ids.order_id` retrieval fixture and amount/currency/correlation checks | `LOCAL_CONTRACT_PASS`; no real webhook |
| Persistent replay/reconciliation | Medusa `paypal_event_inbox` module with unique provider event ID and safe metadata fields | `SCAFFOLD_ONLY`; no migration/read-back/replay integration |
| Refund/async state truth | Pending/failed/refund event policy documented; no fake success | `SANDBOX_REQUIRED` |
| Production inventory levels | Inventory plan, location-level request builder, fail-closed write flag | `LOCAL_CONTRACT_PASS`; production write and concurrency fixture not run |
| Store API public boundary | Prefixed metadata allowlist plus nested cart/order product/variant projection tests | `LOCAL_CONTRACT_PASS` for unit projection; direct API matrix remains limited |
| Recovery/a11y/responsive/security | Payment recovery messaging, aria alert, stacked summaries, hook dependency fixes, CSP/HSTS/image optimization | `LOCAL_RUNTIME_PASS_WITH_BROWSER_GAP` |
| Dependency security | Current audit and per-advisory triage | `REVIEW_REQUIRED`; no updates |
| Full sandbox vertical transaction | No external call or order | `EXTERNAL_ACTION_REQUIRED` |

No row above should be read as a Reviewer PASS decision.
