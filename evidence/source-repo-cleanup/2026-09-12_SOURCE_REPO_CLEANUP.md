# CrossBorder Source Repository Cleanup Record

Date: 2026-09-12
Governance: `VPS Project Governance v0.1.6`

## Source snapshot before cleanup

`entropy-student/CrossBorder@f2a8a589f377b3d63e37978159b16fc2c3e5b838`

All removed material remains recoverable from this Git commit and repository history. The cleanup does not rewrite or destroy history.

## Root review/evidence material removed from the active source tree

- `00_HANDOFF.md`
- `CURRENT_STATE.md`
- `CB-FULL-REVIEW-CHECKPOINT-002_MANIFEST.md`
- `CB-FULL-REVIEW-CHECKPOINT-002-ROUND-2_MANIFEST.md`
- `CB-FULL-REVIEW-CHECKPOINT-002-FINAL-ROUND-3_MANIFEST.md`
- `CB-FULL-REVIEW-CHECKPOINT-002-FIX-R1_VALIDATION.md`
- `CB-FULL-REVIEW-CHECKPOINT-002-FIX-R2-FINAL_VALIDATION.md`
- `DEPENDENCY_AUDIT_SANITIZED.json`
- `DEPENDENCY_AUDIT_TRIAGE.md`
- `DOCKER_RECOVERY_AND_DISK_AUDIT.md`
- `DOCUMENT_CLEANUP_VALIDATION.md`
- `SOURCE_MARKDOWN_AUDIT.md`
- `WORKSPACE_MIGRATION_VALIDATION.md`
- `archive/` historical documentation tree

## Operations material removed from the active source tree

The following documents are historical review/selection/evidence artifacts rather than current project-operation contracts:

- `operations/ACCEPTANCE_GATES.md`
- `operations/REVIEW_PACKAGING.md`
- `operations/RUNTIME_SCORECARD.md`

They remain recoverable from the pre-cleanup source commit above.

## Material intentionally retained

- current application snapshot under `review-source/`;
- project-local operational runbook/preflight documents;
- product and UI contracts;
- deployment placeholder/status;
- payment documents that still describe existing source code or can support the future external-system intake;
- one source-side `REVIEWER_HANDOFF.md` pointer to the canonical Reviewer repository;
- refreshed `README.md`, `DOCUMENT_INDEX.md`, `ROADMAP.md`, and `PRODUCTION_READINESS.md`.

## Architecture note

The Owner has directed that future payment and fulfillment should integrate with another already-running system. Existing custom PayPal/reconciliation implementation is preserved but is no longer the active implementation direction. The next future Gate, when work resumes, is an external payment/fulfillment system intake rather than further custom reconciliation work.
