# CrossBorder Independent Store — REVIEWER HANDOFF

> Maintainer: Reviewer / Architect / Gatekeeper only  
> Governance: `VPS Project Governance v0.1.6`  
> Executor facts: [`EXECUTOR_HANDOFF.md`](EXECUTOR_HANDOFF.md)  
> Detailed evidence index: [`EXECUTION_EVIDENCE.md`](EXECUTION_EVIDENCE.md)  
> Historical Reviewer decisions: [`reviewer/`](reviewer/)  
> Gate prompts: [`tasks/`](tasks/)  
> Raw/historical execution records: [`execution/`](execution/)

## 1. Project Goal

- Final goal: make the CrossBorder independent store usable, verifiable, recoverable, and safe to launch.
- Current business/production goal: reach a reviewed Sandbox/Preview transaction path before any Live payment or production enablement.
- Current source head: `entropy-student/CrossBorder@f2a8a589f377b3d63e37978159b16fc2c3e5b838`.
- Reviewed application baseline: `entropy-student/CrossBorder@0f51a313a745d6977f1a6863485680f837c4814e`.
- P0 source comparison found no application/runtime/payment/storefront code drift between those revisions; only governance/document files changed.

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
- Application source: `CrossBorder/review-source/03_template/medusa-crossborder-base/`; original working tree was `CrossBorder-Independent-Store/03_template/medusa-crossborder-base/`.
- Data/persistence: PostgreSQL for Medusa; Redis is part of the reviewed production-oriented runtime path. Production persistence topology is not yet sealed.
- Storefront exposure: customer payment exposure is fail-closed by default; technical payment remains test-only.
- Payment: existing source contains a PayPal AUTHORIZE/no-auto-capture adapter and reconciliation scaffold. This handoff does NOT select PayPal as the final production provider. A provider direction change is Owner-only.
- Deployment: persistent Medusa backend host, public receiver ingress, DNS/TLS and production storage layout are not yet accepted.
- Secrets: values must remain outside source, ordinary evidence, handoff and logs.
- Shared Infra dependency: `UNKNOWN` until a concrete deployment target is selected. If Shared VPS is selected, Storage Layout Contract rev1 and Shared VPS Contract become mandatory before deployment writes.

## 4. Current State

```text
Legacy full review / historical batches       ✅ preserved as history
Governance normalization to v0.1.6            ✅ PASS
P0 CURRENT-STATE REBASE                       ✅ PASS
BATCH-06-R1 historical Reviewer decision      ↩ RETURN (scoped local evidence retained)
BATCH-07 historical Reviewer decision         ↩ RETURN / OWNER ACTION REQUIRED at that time
P1 RECONCILIATION DURABILITY                  ← ACTIVE / AUTHORIZED FOR EXECUTION
Hosted Sandbox / external provider E2E        🔒 CLOSED
Live payment / production enablement          🔒 CLOSED
```

The historical BATCH-07 prompt is not the current task and must not be resumed automatically.

## 5. Accepted Gates / Baselines

Historical evidence accepted with original scope, not as production readiness:

- BATCH-06-R1 Docker build/runtime artifact: PASS WITH SCOPE.
- BATCH-06-R1 isolated PostgreSQL/Redis runtime: PASS WITH SCOPE.
- BATCH-06-R1 Store API/inventory internal checks: PASS WITH SCOPE.
- BATCH-06-R1 webhook persistence/concurrency evidence: PASS WITH SCOPE only; provider-to-Medusa production convergence was not proven.
- BATCH-07 external preflight: execution facts accepted; no cloud resource, DNS, transaction, Live endpoint, or Live Secret operation occurred.
- P0 current-state rebase: PASS for governance/source-state reconciliation only.
- No Reviewer decision has accepted Sandbox E2E, public backend receiver, Live payment, production inventory, or production deployment.

P0 decision: [`reviewer/P0-CURRENT-STATE-REBASE/REVIEW_DECISION.md`](reviewer/P0-CURRENT-STATE-REBASE/REVIEW_DECISION.md)  
P0 finding rebase: [`reviewer/P0-CURRENT-STATE-REBASE/FINDING_REBASE_MATRIX.md`](reviewer/P0-CURRENT-STATE-REBASE/FINDING_REBASE_MATRIX.md)

## 6. Current Gate — P1 RECONCILIATION DURABILITY & STORAGE CONSISTENCY

Canonical execution prompt: [`tasks/P1-RECONCILIATION-DURABILITY.md`](tasks/P1-RECONCILIATION-DURABILITY.md)

### Goal

Harden the existing reconciliation scaffold locally so known crash/replay/storage ambiguity is closed before any hosted Sandbox/provider E2E work.

### Allowed

- project-local reversible PayPal/reconciliation source changes;
- project-local worker/subscriber/functional CLI wiring;
- reconciliation-only migrations/tests;
- isolated PostgreSQL/Redis and disposable local runtime fixtures;
- local Docker/runtime checks where required;
- sanitized evidence and Executor handoff updates.

### Forbidden

- external payment-provider API calls or transactions;
- customer payment enablement;
- Live endpoint/credentials;
- public ingress, DNS/TLS or cloud resource creation;
- Shared Infra changes;
- production inventory/customer data writes;
- payment-provider migration/selection;
- Secret disclosure or irreversible deletion.

### Acceptance summary

P1 must prove:

1. one canonical `provider_resource_id` representation;
2. concurrent duplicate -> one actionable claim;
3. crash/restart recovery from `received`;
4. crash/restart recovery from `dispatch_requested`;
5. applied replay does not reapply;
6. a real project-local caller drives reconciliation rather than only direct test invocation;
7. pending refund converges through deterministic read-back and mismatched resource fails closed;
8. isolated persistence survives the required restart boundary;
9. payment exposure remains fail-closed and external payment API call count remains zero;
10. cleanup/regression and sanitized evidence are complete.

Rollback: Git revert of P1 source changes plus teardown of P1-only isolated resources. Broad Docker prune is forbidden.

## 7. Confirmed Facts

- Source comparison from the reviewed application baseline to current head found only governance/document changes; accepted local evidence does not require rerun solely because of the governance migration.
- The current source contains a PayPal provider, HTTP transport, payment-return route, webhook verification and reconciliation module; customer exposure remains fail-closed by default.
- Current webhook handling refuses an already-claimed replay from generating another Medusa action.
- The current reconciliation service persists a new event as `received` and later updates it to `verified`; durable recovery from a crash between those operations is not proven.
- `provider_resource_id` can currently cross raw/digested representation boundaries between initial persistence and later mapping update.
- `markAppliedAfterMedusaReadback` and `reconcileRefundOperation` exist. The current repository does not yet have accepted evidence that a production worker/subscriber/functional CLI automatically drives those methods to convergence.
- `scripts/paypal-reconcile.mjs` remains a fail-closed placeholder rather than a functional reconciliation caller.
- Dependency advisories must be freshly re-audited before Live; old exact audit counts are not current authority.
- No current evidence authorizes Live payment, production inventory, public backend exposure, or production deployment.

## 8. UNKNOWN / Open Risks

These do not block P1 unless the Executor discovers material drift:

- final external checkout provider for this project;
- persistent backend hosting target and whether it is Shared VPS, another persistent host, or managed runtime;
- real production inventory, fulfillment, logistics, returns, tax/customs and customer-policy facts;
- production PostgreSQL/Redis/R2 topology, backup/restore evidence, rollback release and monitoring;
- hosted browser matrix, signed provider webhook E2E, provider read-back and one bounded Sandbox transaction;
- complete Store API privacy matrix and production inventory behavior;
- production storage locations; if Shared VPS is used, `PROJECT_STORAGE_MANIFEST.md` becomes mandatory before deployment writes.

## 9. Owner-only Checkpoints

- payment/purchase/subscription;
- identity/account authorization and external platform approval;
- Secret creation, secure entry and rotation;
- irreversible delete;
- material production enablement / Live payment;
- major payment-provider/business/compliance direction change.

P1 requires none of the above. `OWNER_ACTION_REQUIRED=NO`.

## 10. Resource Baseline

- Production host root disk: `UNKNOWN`.
- Production source/data/backups layout: `UNKNOWN`.
- Production image identity/size: historical local evidence exists; current production baseline is `UNKNOWN`.
- Build cache / browser runtime: not part of a current accepted production baseline.
- P1 writable runtime must be isolated and project-local; no production resource baseline is created by P1.

## 11. Rollback / Recovery

- Production rollback release/image: `UNKNOWN` / not yet sealed.
- Backup/recovery pair: `UNKNOWN` / not yet accepted.
- Restore validation: not yet accepted.
- Governance-document rollback: Git history.
- P1 rollback: Git revert + teardown of only P1-created isolated runtime resources.

## 12. Next Step

- Executor next action: execute `tasks/P1-RECONCILIATION-DURABILITY.md` exactly, starting with preflight.
- Executor result: one of the prompt-defined exact `RETURN_*` results or `PASS_CANDIDATE_P1`, then STOP.
- Reviewer next action after Executor: independently review P1 evidence and issue PASS/RETURN; do not auto-advance.
- Owner intervention required now: NO.

## 13. Status Summary

- Overall progress: governance and current-state rebase are closed; local runtime foundations exist; reconciliation durability is now the active bounded engineering Gate.
- Final goal: safe usable independent store with verified payment, fulfillment, recovery and production boundaries.
- Current Gate: `P1 RECONCILIATION DURABILITY & STORAGE CONSISTENCY`.
- This round completed: P0 source/historical finding rebase and next-Gate authorization.
- Next: Executor performs P1 locally; hosted Sandbox/provider E2E remains closed.
- Attention: P1 does not choose the production payment provider and does not authorize any external transaction or deployment.
