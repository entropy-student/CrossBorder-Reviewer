# CrossBorder Independent Store — EXECUTOR HANDOFF

> Maintainer: Execution Agent  
> Reviewer truth: `REVIEWER_HANDOFF.md`  
> Authority: actual execution facts only; no architecture decisions.

## Current Task

- Gate: `P1 RECONCILIATION DURABILITY & STORAGE CONSISTENCY`
- State: `AUTHORIZED / NOT_STARTED`
- Prompt/package: `tasks/P1-RECONCILIATION-DURABILITY.md`
- Source repository: `entropy-student/CrossBorder`
- Current inspected source head: `f2a8a589f377b3d63e37978159b16fc2c3e5b838`
- Reviewed application baseline: `0f51a313a745d6977f1a6863485680f837c4814e`
- P0 found no application/runtime/payment/storefront drift between those revisions; only governance/document files changed.

## Authorized Scope

Project-local and reversible only:

- existing PayPal/reconciliation source;
- project-local worker/subscriber/functional CLI reconciliation wiring;
- reconciliation-only migrations/tests;
- isolated PostgreSQL/Redis/disposable runtime fixtures;
- local Docker/runtime checks if needed;
- sanitized evidence and this handoff.

Follow the exact allowed/forbidden rules and acceptance criteria in the P1 prompt.

## Forbidden / Stop Boundary

Do not:

- call external payment-provider APIs or execute provider transactions;
- enable customer payment or Live;
- create public ingress, DNS/TLS, cloud resources or hosted receivers;
- modify Shared Infra;
- write production inventory/customer data;
- select/migrate the production payment provider;
- disclose Secrets;
- perform irreversible deletion.

Stop with the prompt-defined exact `RETURN_*` code if any forbidden dependency becomes necessary.

## Preflight / Baseline

Before writes:

1. read root `REVIEWER_HANDOFF.md`;
2. read `reviewer/P0-CURRENT-STATE-REBASE/REVIEW_DECISION.md` and its finding matrix;
3. compare actual source state with the P1 baseline and return `RETURN_SOURCE_DRIFT` on material reconciliation-architecture drift;
4. prove writable tests use isolated infrastructure;
5. prepare project-local rollback;
6. prove customer payment remains fail-closed;
7. do not read/print payment Secret values.

Historical evidence available for reuse with original scope:

- `execution/BATCH-06-R1/` local Docker/runtime, isolated DB/Redis and webhook persistence/concurrency evidence;
- `execution/BATCH-07/` host/deployment preflight and production-caller search.

Do not rerun accepted Gates unless P1 preflight finds material drift that requires it.

## Actual Execution

`NOT_STARTED`

No P1 source write, database write, external call or runtime action is recorded by this handoff yet.

## Required Validation

P1 must produce evidence for:

- one canonical `provider_resource_id` representation;
- concurrent duplicate -> one actionable claim;
- restart recovery from `received`;
- restart recovery from `dispatch_requested`;
- no reapply after `applied`;
- real project-local reconciliation caller path;
- pending refund completed/failed convergence and mismatch fail-closed behavior;
- isolated PostgreSQL persistence across restart boundary;
- payment exposure still fail-closed;
- external payment API calls = 0;
- cleanup completed.

## Evidence Destination

Recommended detailed directory:

`execution/P1-RECONCILIATION-DURABILITY/`

Update:

- `EXECUTION_EVIDENCE.md` with sanitized facts/links;
- this `EXECUTOR_HANDOFF.md` with actual actions/results.

Do not write a formal Reviewer PASS here.

## Cleanup

P1 cleanup is part of the Gate:

- tear down only P1-created isolated resources;
- preserve evidence;
- no broad Docker prune;
- no Shared Infra cleanup;
- record actual cleanup result.

## Result

Current state:

```text
P1_EXECUTION: NOT_STARTED
OWNER_ACTION_REQUIRED: NO
STOP_AT_REVIEWER_AFTER_EXECUTION: YES
```

On completion, return exactly one prompt-defined `RETURN_*` result or `PASS_CANDIDATE_P1`, update evidence/handoff, and stop for independent Reviewer review.

## Next Step

Execute `tasks/P1-RECONCILIATION-DURABILITY.md` from preflight through cleanup. Do not enter hosted Sandbox/provider E2E or any later Gate without a new Reviewer decision.
