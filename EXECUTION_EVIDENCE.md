# CrossBorder Independent Store — EXECUTION EVIDENCE

> Purpose: index detailed, sanitized execution evidence. This file is not a Reviewer PASS decision.

## Evidence hierarchy

- Reviewer decisions: `reviewer/`
- Gate prompts: `tasks/`
- Execution reports and logs: `execution/`
- Cross-batch supporting artifacts: `evidence/`
- Current Reviewer truth: `REVIEWER_HANDOFF.md`

## Current Gate evidence boundary

### P0 CURRENT-STATE REBASE — CLOSED

Reviewer decision: `reviewer/P0-CURRENT-STATE-REBASE/REVIEW_DECISION.md`  
Finding rebase: `reviewer/P0-CURRENT-STATE-REBASE/FINDING_REBASE_MATRIX.md`

Reviewer source-state evidence:

- reviewed application baseline: `CrossBorder@0f51a313a745d6977f1a6863485680f837c4814e`;
- current inspected source head: `CrossBorder@f2a8a589f377b3d63e37978159b16fc2c3e5b838`;
- Git comparison: four commits ahead; changed files are only `00_HANDOFF.md`, `CURRENT_STATE.md`, `DOCUMENT_INDEX.md`, and `REVIEWER_HANDOFF.md`;
- no application/runtime/payment/storefront source drift was found by that comparison.

P0 performed read-only source/review inspection plus Reviewer-repository documentation updates. It did not execute runtime writes, provider calls, transactions or deployment.

### P1 RECONCILIATION DURABILITY — ACTIVE / NO EXECUTION EVIDENCE YET

Authorized prompt: `tasks/P1-RECONCILIATION-DURABILITY.md`

Expected detailed evidence directory after execution:

`execution/P1-RECONCILIATION-DURABILITY/`

Until Executor runs P1 and records actual facts, no P1 PASS/RETURN inference is allowed.

Minimum P1 evidence expected:

- source commit/diff summary;
- command exit status;
- canonical provider-resource identity read-back;
- concurrent claim/replay/apply counts;
- restart recovery from `received` and `dispatch_requested` boundaries;
- pending refund convergence and mismatch fail-closed behavior;
- real project-local reconciliation caller proof;
- isolated PostgreSQL persistence evidence;
- customer-payment fail-closed regression;
- `external_payment_api_calls=0`;
- cleanup result and no-Secret-recorded statement.

## Historical evidence most relevant to current work

### BATCH-06-R1

Reviewer accepted with scope:

- local Docker build/runtime artifact evidence;
- isolated PostgreSQL/Redis runtime evidence;
- Store API/internal inventory checks;
- webhook persistence/concurrency evidence in isolated PostgreSQL.

Not proven by that batch:

- hosted backend receiver;
- signed provider webhook E2E;
- automatic Medusa read-back convergence through a production caller;
- provider-backed refund reconciliation;
- Sandbox transaction flow;
- production release readiness.

Primary evidence:

- `execution/BATCH-06-R1/BATCH_REPORT.md`
- `execution/BATCH-06-R1/FINDING_MATRIX.md`
- `execution/BATCH-06-R1/A-docker/`
- `execution/BATCH-06-R1/B-paypal/`
- `execution/BATCH-06-R1/C-integration/`
- Reviewer decision: `reviewer/BATCH-06-R1/REVIEW_DECISION.md`

### BATCH-07

Execution facts:

- external host/deployment preflight performed;
- no hosted receiver or provider E2E executed;
- no production release executed;
- production caller search for reconciliation methods preserved.

Primary evidence:

- `execution/BATCH-07/BATCH_REPORT.md`
- `execution/BATCH-07/FINDING_MATRIX.md`
- `execution/BATCH-07/A-host/`
- `execution/BATCH-07/B-sandbox-receiver/`
- Reviewer decision: `reviewer/BATCH-07/REVIEW_DECISION.md`

The historical BATCH-07 Owner-action blocker does not block current P1 because P1 is local, reversible and explicitly forbids hosted deployment/provider transactions.

## Legacy evidence

BATCH-01 through BATCH-06 and RT-* evidence is preserved for audit/history. A historical execution document can describe an observed result, but it cannot override a later Reviewer decision or the current `REVIEWER_HANDOFF.md`.

## Evidence rules going forward

1. Record facts that can be independently checked.
2. Keep values requiring confidentiality out of ordinary evidence.
3. A successful command or test does not equal a Gate PASS.
4. Cleanup/regression is part of the same Gate evidence boundary.
5. `PASS_CANDIDATE != PASS`.
6. Do not promote deterministic/local seams to hosted/provider evidence.
