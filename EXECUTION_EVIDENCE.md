# CrossBorder Independent Store — EXECUTION EVIDENCE

> Purpose: index detailed, sanitized execution evidence. This file is not a Reviewer PASS decision.

## Evidence hierarchy

- Reviewer decisions: `reviewer/`
- Gate prompts: `tasks/`
- Execution reports and logs: `execution/`
- Cross-batch supporting artifacts: `evidence/`
- Current Reviewer truth: `REVIEWER_HANDOFF.md`

## Current evidence boundary

### P0 CURRENT-STATE REBASE — CLOSED

Reviewer decision: `reviewer/P0-CURRENT-STATE-REBASE/REVIEW_DECISION.md`  
Finding rebase: `reviewer/P0-CURRENT-STATE-REBASE/FINDING_REBASE_MATRIX.md`

P0 established the current authority model and confirmed no application-code drift in the reviewed source comparison.

### SOURCE REPOSITORY CLEANUP — CLOSED

Reviewer decision: `reviewer/SOURCE-REPO-CLEANUP-2026-09-12/REVIEW_DECISION.md`  
Cleanup record: `evidence/source-repo-cleanup/2026-09-12_SOURCE_REPO_CLEANUP.md`

Key facts:

- pre-cleanup source: `CrossBorder@f2a8a589f377b3d63e37978159b16fc2c3e5b838`;
- post-cleanup source: `CrossBorder@b57dd733e73c08a8bfa6c0c9b0765d5652226189`;
- Git comparison shows documentation/history changes only;
- no file under `review-source/` changed;
- historical review/archive material remains recoverable from Git history;
- current source docs were realigned to the external payment/fulfillment integration direction.

### Prior P1 RECONCILIATION DURABILITY — SUPERSEDED BEFORE EXECUTION

The former P1 prompt remains under `tasks/` as history, but no P1 execution evidence exists because the Gate was superseded before execution after the Owner changed the intended payment/fulfillment architecture.

No `execution/P1-RECONCILIATION-DURABILITY/` evidence is expected unless a future Reviewer explicitly reactivates that path.

## Historical evidence most relevant to retained application source

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

BATCH-07 is historical and must not be resumed automatically.

## Future evidence

The project is paused. When work resumes, the next expected Gate is a read-only `EXTERNAL_PAYMENT_FULFILLMENT_SYSTEM_INTAKE`. Evidence should describe only actual observed capabilities of the existing external system and must not infer integration behavior that has not been verified.

## Evidence rules going forward

1. Record facts that can be independently checked.
2. Keep confidential values out of ordinary evidence.
3. A successful command or test does not equal a Gate PASS.
4. Cleanup/regression is part of the same Gate evidence boundary.
5. `PASS_CANDIDATE != PASS`.
6. Do not promote deterministic/local seams to hosted/provider evidence.
