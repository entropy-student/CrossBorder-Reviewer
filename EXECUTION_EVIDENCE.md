# CrossBorder Independent Store — EXECUTION EVIDENCE

> Purpose: index detailed, sanitized execution evidence. This file is not a Reviewer PASS decision.

## Evidence hierarchy

- Reviewer decisions: `reviewer/`
- Gate prompts: `tasks/`
- Execution reports and logs: `execution/`
- Cross-batch supporting artifacts: `evidence/`
- Current Reviewer truth: `REVIEWER_HANDOFF.md`

## Most relevant current evidence

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

## Legacy evidence

BATCH-01 through BATCH-06 and RT-* evidence is preserved for audit/history. A historical execution document can describe an observed result, but it cannot override a later Reviewer decision or the current `REVIEWER_HANDOFF.md`.

## Evidence rules going forward

1. Record facts that can be independently checked.
2. Keep values requiring confidentiality out of ordinary evidence.
3. A successful command or test does not equal a Gate PASS.
4. Cleanup/regression is part of the same Gate evidence boundary.
5. `PASS_CANDIDATE != PASS`.
