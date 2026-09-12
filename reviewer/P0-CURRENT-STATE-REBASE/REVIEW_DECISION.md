# P0 CURRENT-STATE REBASE — Reviewer Decision

Review date: 2026-09-12 (Asia/Shanghai)  
Governance: `VPS Project Governance v0.1.6`  
Reviewer decision: `P0_CURRENT_STATE_REBASE=PASS`  
Scope of PASS: documentation/source-state reconciliation only; **not** Sandbox, deployment, payment, inventory, or production readiness.

## 1. Decision

P0 is complete. The repository now has a reliable current authority model, the legacy findings have been rebased against the latest formal Reviewer evidence, and one bounded next execution Gate can be issued without reopening already accepted local Gates.

This PASS does not change historical decisions:

- `BATCH-06-R1=RETURN` remains historical truth for that Gate.
- `BATCH-07=RETURN / USER_ACTION_REQUIRED` remains historical truth for that Gate.
- Their scoped local evidence remains usable where later source inspection shows no material application-code drift.

## 2. Source identity / drift review

Originally reviewed source baseline:

`entropy-student/CrossBorder@0f51a313a745d6977f1a6863485680f837c4814e`

Current source head inspected:

`entropy-student/CrossBorder@f2a8a589f377b3d63e37978159b16fc2c3e5b838`

The Git comparison is four commits ahead and changes only governance/document files:

- `00_HANDOFF.md`
- `CURRENT_STATE.md`
- `DOCUMENT_INDEX.md`
- `REVIEWER_HANDOFF.md`

No application/runtime/payment/storefront source file changed between those revisions. Therefore v0.1.6 rule “do not rerun already PASSed Gates without material drift” applies: accepted local BATCH-06-R1 evidence is not rerun merely because governance documents were normalized.

## 3. Historical evidence carried forward

Accepted with the same scope as the original Reviewer decisions:

- Docker build/runtime artifact: `PASS WITH SCOPE`.
- isolated PostgreSQL/Redis runtime: `PASS WITH SCOPE`.
- Store API/internal inventory checks: `PASS WITH SCOPE`.
- webhook persistence/concurrency in isolated PostgreSQL: `PASS WITH SCOPE`.
- BATCH-07 host/deployment preflight facts: accepted as observations only.
- Live remained closed; no historical decision accepted Live payment or production deployment.

Not promoted by P0:

- hosted backend receiver;
- signed provider webhook E2E;
- provider-backed refund convergence;
- automatic `dispatch_requested -> applied` recovery through a production caller;
- Sandbox vertical transaction;
- production inventory/fulfillment;
- remote CI / hosted browser / backup-restore / rollback;
- production deployment.

## 4. Direct current-source confirmation

Current source inspection confirms:

1. the existing PayPal provider remains fail-closed unless explicitly configured;
2. verified webhook handling uses the persistent reconciliation service and rejects an already-claimed replay from producing another Medusa action;
3. the inbox service creates a record with `received` and then separately updates it to `verified`, leaving an unproven crash/restart recovery boundary between those writes;
4. `provider_resource_id` may be stored using inconsistent raw/digest representations across create/update paths;
5. `markAppliedAfterMedusaReadback` and `reconcileRefundOperation` exist, but the repository does not yet contain an accepted production worker/subscriber/functional CLI path proving automatic convergence;
6. `scripts/paypal-reconcile.mjs` is intentionally fail-closed and currently reports that no external API was called rather than performing real reconciliation.

These facts are captured in [`FINDING_REBASE_MATRIX.md`](FINDING_REBASE_MATRIX.md).

## 5. P0 acceptance criteria result

| Criterion | Result |
|---|---|
| Current source reconciled with historical Reviewer conclusions | PASS |
| Stale/legacy authority explicitly demoted | PASS |
| Material findings classified as current / unknown / obsolete / historical | PASS |
| Next Gate bounded with allowed/forbidden scope, evidence and rollback | PASS |
| Owner interrupted only for Owner-only checkpoints | PASS — no Owner action required for next Gate |

## 6. Architecture / direction boundary

P0 does **not** select the final external checkout provider. The current source contains a PayPal-oriented scaffold, while the final provider remains an Owner-level product/payment direction if it changes.

The next Gate is allowed to harden that existing scaffold locally because the work is project-local, reversible and safety-oriented. It must not be interpreted as selecting PayPal for production or as authorization to migrate to another provider.

Likewise, Backend host selection is not required for the next local Gate. The historical BATCH-07 hosting blocker remains relevant only when the project reaches hosted Sandbox/deployment work.

## 7. Next Gate authorization

Authorize:

`P1 RECONCILIATION DURABILITY & STORAGE CONSISTENCY`

Canonical prompt:

[`../../tasks/P1-RECONCILIATION-DURABILITY.md`](../../tasks/P1-RECONCILIATION-DURABILITY.md)

Purpose:

- close the current webhook crash/replay recovery ambiguity;
- canonicalize provider resource identity storage;
- provide a real project-local convergence caller path;
- prove restart/ordering/refund reconciliation behavior in isolated local infrastructure;
- keep customer payment, external provider calls, public ingress and Live completely closed.

## 8. Rollback / safety

P0 itself made governance/review documentation changes only. Rollback is Git history.

P1 is restricted to project-local reversible code/tests and isolated runtime fixtures. It may not modify Shared Infra, DNS, public ingress, production data, production inventory, external payment accounts or Live configuration.

## 9. Owner intervention

`OWNER_ACTION_REQUIRED=NO`

No payment, account authorization, Secret entry, irreversible action, production enablement or major direction choice is required to execute P1.

## 10. Final P0 status

```text
Governance normalization                 PASS
P0 current-state rebase                  PASS
Historical accepted local evidence       CARRIED FORWARD WITH ORIGINAL SCOPE
Application-code drift after baseline    NONE FOUND
P1 local execution Gate                  AUTHORIZED
Hosted Sandbox / external transaction    CLOSED
Live / production enablement             CLOSED
```
