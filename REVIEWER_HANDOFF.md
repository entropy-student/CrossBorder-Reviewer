# CrossBorder Independent Store — REVIEWER HANDOFF

> Maintainer: Reviewer / Architect / Gatekeeper only  
> Governance: `VPS Project Governance v0.1.6`  
> Executor facts: [`EXECUTOR_HANDOFF.md`](EXECUTOR_HANDOFF.md)  
> Detailed evidence index: [`EXECUTION_EVIDENCE.md`](EXECUTION_EVIDENCE.md)  
> Historical Reviewer decisions: [`reviewer/`](reviewer/)  
> Historical Gate prompts: [`tasks/`](tasks/)  
> Raw/historical execution records: [`execution/`](execution/)

## 1. Project Goal

- Final goal: make the CrossBorder independent store usable, verifiable, recoverable, and safe to launch.
- Current business/production goal: reach a reviewed Sandbox/Preview transaction path before any Live payment or production enablement.
- Current source snapshot under review: `entropy-student/CrossBorder@0f51a313a745d6977f1a6863485680f837c4814e`.

## 2. Authority / Source of Truth

1. Owner latest explicit instruction.
2. Shared VPS Contract, if this project is later assigned to the Shared VPS.
3. This `REVIEWER_HANDOFF.md`.
4. Current Reviewer Gate Prompt / decision.
5. `EXECUTION_EVIDENCE.md`.
6. `EXECUTOR_HANDOFF.md`.
7. README / historical reports / old batch documents / chat.

`CURRENT_STATUS.md`, `NEXT_EXECUTOR_TASK.md`, the old project `00_HANDOFF.md`, and old `CURRENT_STATE.md` are compatibility/history only and MUST NOT become competing current truth.

## 3. Current Architecture

- Runtime/framework: Medusa 2.19 backend + Next.js 15 storefront.
- Application source: `CrossBorder/review-source/03_template/medusa-crossborder-base/` in the review snapshot; original working tree was `CrossBorder-Independent-Store/03_template/medusa-crossborder-base/`.
- Data/persistence: PostgreSQL for Medusa; Redis is part of the reviewed production-oriented runtime path. Production persistence topology is not yet sealed.
- Storefront exposure: customer payment exposure is fail-closed by default; technical payment remains test-only.
- Payment: PayPal AUTHORIZE/no-auto-capture adapter and reconciliation scaffold exist; customer/Sandbox exposure is disabled by default. WorldFirst material in this project is settlement/collection-account context, not a customer checkout gateway.
- Deployment: persistent Medusa backend host, public receiver ingress, DNS/TLS and production storage layout are not yet accepted.
- Secrets: values must remain outside source, ordinary evidence, handoff and logs.
- Shared Infra dependency: `UNKNOWN` until a concrete deployment target is selected. If Shared VPS is selected, Storage Layout Contract rev1 and Shared VPS Contract become mandatory before deployment writes.

## 4. Current State

```text
Legacy full review / historical batches       ✅ preserved as history
Governance normalization to v0.1.6            ✅ PASS
BATCH-06-R1 historical Reviewer decision      ↩ RETURN
BATCH-07 historical Reviewer decision         ↩ RETURN / OWNER ACTION REQUIRED at that time
P0 CURRENT-STATE REBASE                       ← ACTIVE (read-only Reviewer gate)
Next execution Gate                           ⏳ not authorized until P0 rebase closes
Live payment / production enablement          🔒 CLOSED
```

The old BATCH-07 prompt is NOT automatically the current execution task. The code snapshot imported on 2026-09-12 must first be reconciled against the legacy review decisions and the latest Owner direction.

## 5. Accepted Gates / Baselines

Historical evidence accepted with scope, not as production readiness:

- BATCH-06-R1 Docker build/runtime artifact: PASS WITH SCOPE.
- BATCH-06-R1 isolated PostgreSQL/Redis runtime: PASS WITH SCOPE.
- BATCH-06-R1 Store API/inventory internal checks: PASS WITH SCOPE.
- BATCH-06-R1 webhook persistence/concurrency evidence: PASS WITH SCOPE only; provider-to-Medusa production convergence was not proven.
- BATCH-07 external preflight: execution facts accepted; no cloud resource, DNS, transaction, Live endpoint, or Live Secret operation occurred.
- No Reviewer decision has accepted Sandbox E2E, public backend receiver, Live payment, production inventory, or production deployment.

## 6. Current Gate — P0 CURRENT-STATE REBASE

- Goal: build a reliable current project map from the 2026-09-12 source snapshot and historical Reviewer evidence, then define the next safe execution Gate.
- Allowed scope: read-only code/document inspection, comparison with accepted evidence, stale-document classification, dependency/config review, architecture/risk mapping.
- Forbidden scope: Live API calls, real charges, production inventory writes, DNS changes, cloud resource creation, Shared Infra changes, Secret disclosure, irreversible deletion, material production enablement.
- Acceptance criteria:
  1. current source and historical Reviewer conclusions are reconciled;
  2. stale/legacy claims are explicitly marked non-authoritative;
  3. remaining findings are classified as confirmed / UNKNOWN / obsolete;
  4. next Gate has bounded scope, evidence and rollback;
  5. Owner is interrupted only for a true Owner-only checkpoint.
- Evidence required: direct current-source references plus the relevant historical execution evidence / Reviewer decisions.
- Rollback: documentation-only governance migration is reversible through Git history; this Gate performs no runtime writes.

## 7. Confirmed Facts

- Last formal historical Reviewer decision is `reviewer/BATCH-07/REVIEW_DECISION.md`: `RETURN / USER_ACTION_REQUIRED` at that time because a persistent backend host/deployment path was not available.
- The current source snapshot contains a PayPal provider, HTTP transport, payment-return route, webhook verification and a reconciliation module; provider exposure remains fail-closed by default.
- The current reconciliation code persists verified webhook events and rejects a replayed claim, but a crash window remains between initial row creation and later verification/dispatch processing; durable recovery of that window is not yet proven.
- `markAppliedAfterMedusaReadback` and refund reconciliation logic exist, but the historical BATCH-07 search did not find a production worker/subscriber/CLI caller that proves automatic convergence.
- Fresh 2026-09-12 source inspection also found a storage-consistency issue around `provider_resource_id` hashing/raw overwrite and requires Sandbox validation of Medusa semantics for pending capture/refund states.
- The current source tree has documented dependency advisories that must be re-audited before Live; no automatic force-upgrade is authorized by this handoff.
- No current evidence authorizes Live payment, production inventory, public backend exposure, or production deployment.

## 8. UNKNOWN / Open Risks

- Current intended backend hosting target and whether it is Shared VPS, another persistent host, or a managed runtime.
- Current intended external checkout provider after reconciling the latest Owner direction with the legacy PayPal-oriented plan.
- Real production inventory, fulfillment, logistics, returns, tax/customs and customer-policy facts.
- Production PostgreSQL/Redis/R2 topology, backup/restore evidence, rollback release and monitoring.
- Hosted browser matrix, signed provider webhook E2E, provider read-back, restart/ordering recovery and one bounded Sandbox transaction.
- Production storage locations; if Shared VPS is used, `PROJECT_STORAGE_MANIFEST.md` does not yet exist and is mandatory before deployment.

## 9. Owner-only Checkpoints

- Payment/purchase/subscription: Owner only.
- Identity/account authorization and external platform approval: Owner only.
- Secret creation, secure entry and rotation: Owner only.
- Irreversible delete: Owner only.
- Material production enablement / Live payment: Owner only.
- Major payment-provider/business/compliance direction change: Owner only.
- P0 current-state rebase itself requires no Owner action.

## 10. Resource Baseline

- Production host root disk: `UNKNOWN`.
- Production source/data/backups layout: `UNKNOWN`.
- Production image identity/size: historical local evidence exists; current production baseline is `UNKNOWN`.
- Build cache / browser runtime: not part of a current accepted production baseline.

## 11. Rollback / Recovery

- Production rollback release/image: `UNKNOWN` / not yet sealed.
- Backup/recovery pair: `UNKNOWN` / not yet accepted.
- Restore validation: not yet accepted.
- Governance-document rollback: Git history.

## 12. Next Step

- Reviewer next action: finish P0 current-state rebase across `CrossBorder` current source and this legacy Reviewer repository; close or carry forward each material finding.
- Executor next action: NONE until Reviewer issues a new bounded Gate Prompt.
- Owner intervention required now: NO.

## 13. Status Summary

- Overall progress: architecture and local verification foundations exist; production transaction/deployment closure is not accepted.
- Final goal: safe usable independent store with verified payment, fulfillment, recovery and production boundaries.
- Current Gate: `P0 CURRENT-STATE REBASE`.
- This round completed: governance normalization and canonical handoff establishment.
- Next: reconcile current source vs legacy review, then define one bounded execution Gate.
- Attention: do not resume legacy BATCH-07 automatically and do not treat historical execution self-reports as Reviewer PASS.
