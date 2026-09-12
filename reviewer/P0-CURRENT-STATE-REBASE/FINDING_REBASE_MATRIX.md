# P0 Current-State Rebase — Finding Matrix

Review date: 2026-09-12 (Asia/Shanghai)  
Governance: `VPS Project Governance v0.1.6`  
Source baseline originally reviewed: `entropy-student/CrossBorder@0f51a313a745d6977f1a6863485680f837c4814e`  
Current source head inspected: `entropy-student/CrossBorder@f2a8a589f377b3d63e37978159b16fc2c3e5b838`

## Classification meanings

- `CONFIRMED_CURRENT`: still materially relevant to the current source/project state.
- `OBSOLETE_FIXED`: the original defect was closed or superseded by later accepted work; a narrower successor risk may still remain.
- `UNKNOWN_REVALIDATE`: later evidence is insufficient to close or reconfirm the exact historical claim; revalidate only when its trigger is reached.
- `HISTORICAL_ONLY`: useful context/quality observation, but not a current actionable defect or Gate blocker by itself.

## Source drift result

Git comparison from the reviewed source baseline to the current head shows only governance/document changes (`00_HANDOFF.md`, `CURRENT_STATE.md`, `DOCUMENT_INDEX.md`, `REVIEWER_HANDOFF.md`). No application/runtime/payment/storefront source file changed after the reviewed snapshot. Therefore later formal Reviewer conclusions can be carried forward without rerunning already accepted local Gates solely because of the governance migration.

## Legacy finding rebase

| ID | Classification | Current disposition |
|---|---|---|
| AR-01 | OBSOLETE_FIXED | Governance normalization established one canonical `REVIEWER_HANDOFF.md`; competing current-state documents were demoted to compatibility/history. |
| AR-02 | CONFIRMED_CURRENT | Source and Reviewer/evidence remain separate repositories; a sealed release identity tying source + evidence has not yet been accepted. |
| AR-03 | OBSOLETE_FIXED | Later batches explicitly combined runtime, product/inventory, payment and deployment work; the next Gate is not payment-only. |
| AR-04 | HISTORICAL_ONLY | Complexity observation remains useful architecture context but is not a bounded defect to repair in the next Gate. |
| AR-05 | CONFIRMED_CURRENT | End-to-end money/order/inventory/notification consistency has not been accepted and remains a launch criterion. |
| PAY-01 | OBSOLETE_FIXED | Server-side checkout/payment boundaries and fail-closed customer exposure now exist; customer payment remains disabled by default. |
| PAY-02 | OBSOLETE_FIXED | BATCH-02 accepted different-order rejection as a local contract and later transport work preserved resource/correlation validation. |
| PAY-03 | OBSOLETE_FIXED | BATCH-02 accepted required amount evidence as a local contract; later transport validation tightened amount/currency checks. |
| PAY-04 | OBSOLETE_FIXED | The original simple same-operation local replay defect was superseded by persistent operation/reconciliation work. Durable concurrent/provider-backed refund convergence is a separate current risk carried below. |
| PAY-05 | CONFIRMED_CURRENT | Mapping a webhook action still does not prove Medusa/provider convergence. `dispatch_requested -> applied` automatic recovery is not proven through a production caller. |
| PAY-06 | CONFIRMED_CURRENT | No signed hosted Sandbox vertical transaction/recovery path has been accepted. |
| SF-01 | OBSOLETE_FIXED | False-success email editing was removed and the email field was later made read-only. |
| SF-02 | UNKNOWN_REVALIDATE | Later batches improved cache behavior, but no current hosted freshness matrix closes all product/order/region cache semantics. |
| SF-03 | OBSOLETE_FIXED | Add-to-cart recovery/finally behavior was accepted as a local code fix in later review. |
| SF-04 | CONFIRMED_CURRENT | Payment failure/processing recovery improved, but provider-backed return/cancel/retry behavior is not accepted without Sandbox E2E. |
| SF-05 | OBSOLETE_FIXED | Transfer write behavior was moved away from the unsafe GET path in later accepted local work. |
| SF-06 | CONFIRMED_CURRENT | Real after-sales/policy/fulfillment facts and customer support landing behavior are not accepted for launch. |
| SF-07 | UNKNOWN_REVALIDATE | No later formal decision specifically closes the 100-item catalog truncation behavior. |
| SF-08 | OBSOLETE_FIXED | Payment initialization/error UI received a later local fix; retain regression coverage when checkout is reopened. |
| SF-09 | UNKNOWN_REVALIDATE | Payment evidence wording improved, but provider-backed paid/authorized timestamps and states require Sandbox read-back validation. |
| SF-10 | OBSOLETE_FIXED | Later storefront fixes separated several network/error states from empty-cart/not-logged-in behavior. |
| SF-11 | OBSOLETE_FIXED | Unified local type/test/runtime gates and clean-build workflow code were added. Remote CI execution remains a successor evidence gap, not the original missing-gate defect. |
| SF-12 | UNKNOWN_REVALIDATE | No later formal decision closes the complete SEO/noindex configuration claim. Revalidate before Preview/public indexing. |
| SF-13 | UNKNOWN_REVALIDATE | No later formal decision closes the exact label/focus behavior across the hosted browser matrix. |
| SF-14 | OBSOLETE_FIXED | Registration pending-data email matching was fixed in later local work. |
| SF-15 | HISTORICAL_ONLY | Umbrella collection of minor issues; only individually revalidated successor findings should enter future Gates. |
| RT-01 | OBSOLETE_FIXED | Staging deletion boundary passed later local Reviewer probes. |
| RT-02 | OBSOLETE_FIXED | Process identity/tree safety passed later local Reviewer probes. |
| RT-03 | OBSOLETE_FIXED | HTTP 200 alone is no longer accepted as service identity; later local probes passed. |
| RT-04 | OBSOLETE_FIXED | Unified local verification/failure-injection gates were established. Remote clean CI is a separate current evidence gap. |
| RT-05 | OBSOLETE_FIXED | Historical `4 high / 7 moderate` count is stale; later BATCH-05 audit recorded `0 high / 1 moderate`. Dependency audit must still be refreshed before Live. |
| RT-06 | OBSOLETE_FIXED | Runtime/tooling was normalized around Node 22.14 and pnpm 10.11.1 in the accepted image/runtime evidence. Remote CI remains unaccepted. |
| RT-07 | CONFIRMED_CURRENT | Local production-mode evidence is still not a production deployment or hosted runtime acceptance. |
| RT-08 | HISTORICAL_ONLY | Evidence-scope semantics are now governed explicitly by v0.1.6; local evidence is not promoted to hosted/production evidence. |
| PD-01 | CONFIRMED_CURRENT | Store API/public metadata privacy has improved but a complete real HTTP response matrix has not been accepted. |
| PD-02 | CONFIRMED_CURRENT | Production inventory remains closed; complete inventory-level/sales-channel/availability behavior is not accepted. |
| PD-03 | OBSOLETE_FIXED | Later product work unified/strengthened payload mapping and local contract validation. |
| PD-04 | UNKNOWN_REVALIDATE | Later all-variant checks improved, but complete multi-variant production read-back has not been accepted. |
| PD-05 | OBSOLETE_FIXED | Product/component semantic validators were strengthened and accepted locally. |
| PD-06 | OBSOLETE_FIXED | Evidence-backed `VERIFIED` component states were allowed/validated in later local work. |
| PD-07 | OBSOLETE_FIXED | Hard-fail/procurement contradictions were tightened in later local validator work. |
| PD-08 | CONFIRMED_CURRENT | Unit economics, real inventory, last-mile fulfillment, returns/tax/customs remain launch UNKNOWNs. |

## Current-source findings created by P0 rebase

| ID | Classification | Finding / evidence boundary |
|---|---|---|
| P0-R01 | CONFIRMED_CURRENT | Webhook inbox has a crash window: a row is created as `received`, then updated to `verified`; a crash between those writes leaves an existing record that later replay detection can refuse to reclaim. Durable restart recovery is not proven. |
| P0-R02 | CONFIRMED_CURRENT | `provider_resource_id` representation is inconsistent: initial persistence may store a raw supplied ID or a digest fallback, while later mapping update can overwrite it with a raw ID. Storage/query identity must use one canonical representation. |
| P0-R03 | CONFIRMED_CURRENT | Current tree contains `markAppliedAfterMedusaReadback` / `reconcileRefundOperation` definitions and a fail-closed placeholder reconcile script, but no accepted worker/subscriber/real CLI caller proving automatic convergence. |
| P0-R04 | UNKNOWN_REVALIDATE | Medusa semantics for pending capture/refund, restart/ordering and read-back transitions require isolated integration validation; local service methods alone are insufficient. |
| P0-R05 | UNKNOWN_REVALIDATE | Persistent Backend hosting target, public receiver, production PostgreSQL/Redis/R2 topology and Storage Manifest remain intentionally unresolved until deployment target selection. |
| P0-R06 | UNKNOWN_REVALIDATE | Final external checkout provider for this project is not selected by this rebase. Existing PayPal code is the reviewed scaffold; this matrix does not authorize a provider migration or declare PayPal the final production choice. |

## Gate impact

The next safe Gate is local and reversible: harden the existing reconciliation scaffold so later provider/Sandbox work cannot inherit known replay/restart/storage ambiguity. This does **not** choose a production payment provider, expose customer payment, create external resources, or require Owner action.

All deployment/provider-selection/Live findings remain closed behind later Gates.