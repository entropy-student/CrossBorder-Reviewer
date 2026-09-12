# P1 — RECONCILIATION DURABILITY & STORAGE CONSISTENCY

> Role: Execution Agent / Executor  
> Authority: bounded execution package only  
> Governance: `VPS Project Governance v0.1.6`  
> Reviewer truth: root `REVIEWER_HANDOFF.md`  
> Source repository: `entropy-student/CrossBorder`

## 1. Goal

Make the existing payment reconciliation scaffold internally crash-safe and restart-recoverable in isolated local infrastructure before any hosted Sandbox/provider E2E work.

This Gate is **not** a payment-provider selection and does not authorize customer payment, public ingress or Live operations.

## 2. Preflight

Before writes:

1. read `REVIEWER_HANDOFF.md` and `reviewer/P0-CURRENT-STATE-REBASE/REVIEW_DECISION.md`;
2. confirm source head is based on `CrossBorder@f2a8a589f377b3d63e37978159b16fc2c3e5b838` or identify all material drift since it;
3. confirm customer payment exposure remains fail-closed;
4. identify the exact isolated PostgreSQL/Redis/test runtime to be used;
5. prepare a project-local rollback plan before changing source;
6. do not request or print payment Secrets.

If source drift materially changes reconciliation architecture or invalidates this prompt, stop with `RETURN_SOURCE_DRIFT`.

## 3. Allowed scope

Project-local and reversible only:

- existing PayPal/reconciliation module source;
- project-local worker/subscriber/CLI/reconcile wiring;
- migrations required solely for reconciliation state correctness;
- unit/contract/integration tests;
- isolated PostgreSQL/Redis containers or equivalent disposable local fixtures;
- local Docker/runtime verification where needed;
- sanitized execution evidence and handoff updates.

No unrelated refactor or UI redesign.

## 4. Forbidden scope

Do **not**:

- call PayPal, Airwallex, WorldFirst or any external payment API;
- create/authorize/capture/refund a real or Sandbox provider transaction in this Gate;
- enable customer payment exposure;
- enable Live endpoints or use Live credentials;
- create public ingress, DNS, TLS, cloud resources or hosted receivers;
- modify Shared VPS / Shared Infra;
- write production inventory or production/customer data;
- change the final payment-provider direction;
- expose Secret/token/account/order private values in source, logs or evidence;
- perform irreversible deletion.

If any of those becomes necessary, stop rather than expanding scope.

## 5. Required work

### A. Canonical provider identity storage

Resolve the inconsistent `provider_resource_id` representation.

Requirements:

- choose one canonical persisted/query representation;
- create, update, lookup and recovery paths must use the same representation;
- ordinary evidence must not expose raw provider identifiers when a digest/tail is sufficient;
- existing isolated test fixtures must explicitly prove representation consistency.

### B. Crash-safe webhook inbox claim/recovery

Close the known `received -> verified` crash window and define recoverable state transitions.

Prove at minimum:

- duplicate concurrent delivery produces one actionable claim;
- a crash after durable insert but before verification/state advancement can be recovered after restart;
- a crash after `dispatch_requested` but before `applied` does not cause permanent loss or unsafe duplicate application;
- an already `applied` event does not apply twice;
- failed/held records have a bounded retry/reconciliation path rather than becoming silent terminal ambiguity.

Do not mark an event `applied` merely because a mapper returned an action; `applied` must follow Medusa state read-back or equivalent accepted durable confirmation.

### C. Real project-local convergence caller

Provide an actual project path — worker, subscriber or functional CLI — that drives reconciliation candidates through recovery/read-back logic.

It must:

- be callable as project code rather than only through a direct unit-test service invocation;
- use the reconciliation module as the durable state source;
- invoke `markAppliedAfterMedusaReadback` only after accepted Medusa read-back semantics;
- invoke/refine `reconcileRefundOperation` for pending refund recovery;
- fail closed when provider/external read-back is unavailable in this Gate;
- remain testable with injected/deterministic local seams without external API calls.

The existing placeholder `scripts/paypal-reconcile.mjs` may be replaced or wired properly, but a console-only placeholder is not acceptance evidence.

### D. Pending/refund/restart semantics

Using isolated infrastructure and deterministic provider seams, cover:

- pending capture/authorization state;
- pending refund -> completed/failed read-back;
- provider-resource mismatch -> fail closed;
- duplicate refund operation replay;
- restart between durable state transitions;
- ordering/replay cases relevant to the current supported event set.

Do not claim provider E2E from deterministic seams.

### E. Regression / safety

Retain:

- fail-closed customer payment exposure;
- no Live endpoint use;
- existing accepted runtime/payment validation not directly superseded by the fix;
- no Secret values in repository/evidence.

## 6. Acceptance criteria

Return `PASS_CANDIDATE_P1` only if all are true:

1. canonical `provider_resource_id` behavior is demonstrated by tests/read-back;
2. one concurrent event set yields one actionable claim and no duplicate apply;
3. `received` crash/restart recovery is demonstrated;
4. `dispatch_requested` crash/restart recovery is demonstrated;
5. `applied` replay is demonstrated as non-reapplying;
6. a real project-local caller path reaches reconciliation logic without direct test-only method invocation;
7. pending refund can converge to completed/failed through deterministic read-back and ID mismatch fails closed;
8. isolated PostgreSQL persistence survives the required restart boundary;
9. customer payment exposure remains disabled/fail-closed;
10. no external payment API call, public infrastructure change, production write or Secret disclosure occurred;
11. cleanup/regression completes and isolated test resources are removed or intentionally retained with explicit reason.

Any missing criterion means RETURN, not a partial PASS claim.

## 7. Required evidence

Update `EXECUTION_EVIDENCE.md` and `EXECUTOR_HANDOFF.md` with sanitized facts and link detailed evidence under a new execution directory, recommended:

`execution/P1-RECONCILIATION-DURABILITY/`

Evidence should include:

- source commit/diff summary;
- commands + exit status;
- migration/schema/read-back facts if changed;
- concurrency result (claim/replay/apply counts);
- restart recovery result for `received` and `dispatch_requested` boundaries;
- refund pending/completed/failed reconciliation result;
- caller-path proof;
- fail-closed/customer-exposure regression;
- explicit `external_payment_api_calls=0`;
- cleanup result;
- confirmation that Secret values were not recorded.

Do not paste confidential raw event/account/order identifiers; use synthetic fixture IDs, hashes or safe tails.

## 8. Rollback

Before writes, preserve the source baseline.

Rollback domain is project-local:

- revert P1 source/migration/test changes with Git;
- tear down only P1-created isolated runtime resources;
- do not prune shared Docker networks/volumes/images broadly;
- if migration rollback cannot be proved safely on the isolated fixture, stop with RETURN and preserve evidence rather than improvising on real data.

## 9. STOP / RETURN conditions

Use the most specific result:

- `RETURN_SOURCE_DRIFT` — material source drift invalidates the Gate assumptions.
- `RETURN_SCOPE_EXPANSION_REQUIRED` — success requires work outside this Gate.
- `RETURN_DB_ISOLATION_NOT_PROVEN` — writable testing cannot be proved isolated.
- `RETURN_SHARED_INFRA_CHANGE_REQUIRED` — Shared Infra modification would be required.
- `RETURN_OWNER_ACTION_REQUIRED` — a true Owner-only payment/account/Secret/irreversible/production/direction checkpoint is reached.
- `RETURN_RECONCILIATION_DURABILITY_FAILED` — one or more required durability/restart/idempotency criteria fail.
- `PASS_CANDIDATE_P1` — every acceptance criterion is evidenced.

## 10. Executor stop point

After producing one exact result and updating evidence/handoff, stop. Do not self-authorize hosted Sandbox, provider transaction, deployment, DNS, production inventory or the next Gate.
