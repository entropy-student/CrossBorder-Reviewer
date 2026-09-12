# Governance Migration Audit — CrossBorder Reviewer

Migration date: 2026-09-12  
Target governance: `VPS Project Governance v0.1.6`

## 1. Why this migration was needed

The project predates the governance standard. Reviewer decisions, execution facts, current status, Gate prompts and historical analysis were stored in several overlapping locations. The main risk was not loss of evidence; it was multiple documents appearing to be current authority at the same time.

## 2. Findings

### Correctly separated already

- `reviewer/BATCH-*/REVIEW_DECISION.md`: formal historical Reviewer decisions.
- `tasks/`: historical Reviewer Gate/Executor prompts.
- `execution/BATCH-*/BATCH_REPORT.md`: mostly Executor factual reports.
- `execution/**` logs/results: raw or summarized execution evidence.
- `evidence/`: cross-batch supporting evidence.

### Mixed or competing before migration

- `README.md` mixed a dated full Review conclusion with repository navigation.
- `CURRENT_STATUS.md` acted as a second Reviewer handoff.
- `NEXT_EXECUTOR_TASK.md` acted as both current Gate selector and task pointer.
- `REVIEW_WORKFLOW.md` mixed reusable governance rules with changing batch status.
- the source repository `CrossBorder/00_HANDOFF.md` and `CURRENT_STATE.md` claimed current authority even though later Reviewer decisions lived here.
- `execution/**/FINDING_MATRIX.md`, `USER_ACTION_PACKET.md`, `BLOCKER.md` and similar files sometimes use decision-like wording. They are preserved as execution artifacts, but they are not formal Reviewer PASS/RETURN decisions.
- generated `jest-cache/` content was accidentally committed and is not evidence.

## 3. Canonical model after migration

```text
CrossBorder-Reviewer/
├── REVIEWER_HANDOFF.md        # only current Reviewer truth
├── EXECUTOR_HANDOFF.md        # current/last Executor facts
├── EXECUTION_EVIDENCE.md      # evidence index
├── reviewer/                  # historical formal Reviewer decisions
├── tasks/                     # historical/current Gate prompts
├── execution/                 # execution facts, logs, results
├── evidence/                  # supporting evidence
└── 01..07 reports             # dated historical full-review baseline
```

The source repository remains the code/document snapshot. It must point to this repository for current Reviewer state rather than maintain a second independent handoff.

## 4. Classification rules applied

### Reviewer material

Belongs in `REVIEWER_HANDOFF.md` or `reviewer/<gate>/` when it contains:

- formal PASS / RETURN;
- accepted baseline;
- architecture or risk decision;
- Gate allowed/forbidden scope;
- acceptance criteria;
- next Gate authorization;
- Owner-only determination.

### Executor material

Belongs in `EXECUTOR_HANDOFF.md`, `execution/`, or `EXECUTION_EVIDENCE.md` when it contains:

- commands actually run;
- exit/status/read-back observations;
- files changed;
- blockers encountered;
- cleanup results;
- raw/sanitized logs;
- `PASS_CANDIDATE_*` / exact `RETURN_*` self-report.

Executor material never becomes formal PASS by wording alone.

### Historical analysis

The root `01_...` through `07_...` reports remain useful dated Review material, but they are not current handoff. Their findings must be revalidated against current source before being carried into a new Gate.

## 5. Migration decisions

- Established `REVIEWER_HANDOFF.md` as the sole current Reviewer truth.
- Established `EXECUTOR_HANDOFF.md` and `EXECUTION_EVIDENCE.md` as the execution continuity pair.
- Converted the old current-status/task/workflow files into compatibility pointers or governance guidance.
- Added role README files under `reviewer/`, `tasks/`, and `execution/` so new agents do not infer authority from directory names alone.
- Marked the old source-repository handoff/current-state files as compatibility pointers to the canonical Reviewer handoff.
- Kept historical batch evidence in place; evidence provenance is more valuable than physically moving old files.
- Removed/ignored generated Jest cache because it is neither source nor durable evidence.

## 6. Remaining documentation debt

The dated `01_...` through `07_...` full-review reports contain old findings and should not be mass-rewritten. During P0 current-state rebase, each material finding will be classified as:

- `CONFIRMED_CURRENT`
- `OBSOLETE_FIXED`
- `UNKNOWN_REVALIDATE`
- `HISTORICAL_ONLY`

This avoids rewriting history while preventing stale conclusions from being treated as current facts.

## 7. Migration result

`GOVERNANCE_NORMALIZATION = PASS`

The next technical step is a read-only current-state rebase defined in `REVIEWER_HANDOFF.md`. No legacy execution batch is automatically authorized by this migration.
