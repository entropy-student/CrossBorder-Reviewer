# CrossBorder Source Repository Cleanup Record

Date: 2026-09-12
Governance: `VPS Project Governance v0.1.6`

## Source snapshots

Before cleanup:

`entropy-student/CrossBorder@f2a8a589f377b3d63e37978159b16fc2c3e5b838`

Cleanup checkpoint:

`entropy-student/CrossBorder@b57dd733e73c08a8bfa6c0c9b0765d5652226189`

Current documentation-aligned source:

`entropy-student/CrossBorder@a04fdc0aa75ae96dcb5d2388da81023ff4017f15`

Git comparison from the pre-cleanup source to the current source shows documentation/history changes only. No file under the active application snapshot (`review-source/`) changed.

All removed material remains recoverable from Git history. The cleanup does not rewrite or destroy history.

## Removed from the active source root

- legacy source handoff/current-state pointers;
- Full Review checkpoint manifests and validation reports;
- sanitized dependency-audit artifact;
- Docker/disk audit report;
- old document-cleanup/source-markdown/workspace-migration validation reports;
- the entire historical `archive/` tree.

`DEPENDENCY_AUDIT_TRIAGE.md` was retained only as a small historical pointer because a fresh dependency/security review is still required before production.

## Removed from active operations documents

- `operations/ACCEPTANCE_GATES.md`
- `operations/REVIEW_PACKAGING.md`
- `operations/RUNTIME_SCORECARD.md`

These were historical selection/review/evidence material rather than current project-operation contracts.

## Intentionally retained

- application snapshot under `review-source/`;
- project-local runbook and Windows preflight;
- refreshed external prerequisites and fulfillment-readiness contract;
- product and UI contracts;
- deployment status;
- payment documents needed to describe retained source/reference work and support the future external-system intake;
- one source-side `REVIEWER_HANDOFF.md` pointer to the canonical Reviewer repository;
- refreshed `README.md`, `DOCUMENT_INDEX.md`, `ROADMAP.md`, and `PRODUCTION_READINESS.md`.

## Architecture note

The Owner has directed that future payment and fulfillment should integrate with another already-running system. Existing custom PayPal/reconciliation implementation is preserved but is no longer the active implementation direction.

The previous P1 reconciliation Gate was superseded before execution. When the project resumes, the next future Gate is a read-only external payment/fulfillment system intake.
