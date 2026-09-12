# CrossBorder Reviewer

This repository contains the current Reviewer handoff plus review/execution history for `entropy-student/CrossBorder`.

## Canonical entry

- Current Reviewer state: [`REVIEWER_HANDOFF.md`](REVIEWER_HANDOFF.md)
- Executor continuity: [`EXECUTOR_HANDOFF.md`](EXECUTOR_HANDOFF.md)
- Evidence index: [`EXECUTION_EVIDENCE.md`](EXECUTION_EVIDENCE.md)
- Migration notes: [`GOVERNANCE_MIGRATION_AUDIT.md`](GOVERNANCE_MIGRATION_AUDIT.md)

## Directory meaning

- `reviewer/`: formal Reviewer decisions; closed decisions remain history after the handoff advances.
- `tasks/`: Reviewer Gate prompts; a task is current only when root `REVIEWER_HANDOFF.md` names it.
- `execution/`: execution reports/logs/evidence; historical by default, with new current-Gate evidence added only after actual execution.
- `evidence/`: supporting artifacts.
- `01_...` through `07_...`: dated 2026-09-05 review baseline; useful history, not current handoff.

`CURRENT_STATUS.md`, `NEXT_EXECUTOR_TASK.md`, and old batch documents are compatibility/history material. Do not use them as a second current source of truth.

Governance follows `VPS Project Governance v0.1.6`. `PASS_CANDIDATE` is not a formal PASS.
