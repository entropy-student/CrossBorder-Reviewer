# BATCH-04 Git / HEAD Evidence

## Source repository

```text
ROOT=C:\Users\34707\Documents\ChatGPT\跨境电商\CrossBorder-Independent-Store
HEAD=4b7dd0f371f13cc3ee1f598499dcecbf63b33fec
STATUS=DIRTY_BY_EXISTING_B01_B03_AND_BATCH04_WORK
```

The source status contains the previously preserved BATCH-01–03 changes plus
the BATCH-04 code/docs shown in `COMPLETE_DIFF.patch`. No source reset or
checkout was performed.

## Document-center repository

```text
ROOT=C:\Users\34707\Documents\ChatGPT\跨境电商
HEAD=38e879c42ead6e561939a7881526c2a984c158a2
STATUS=DIRTY_BY_PRE_EXISTING_DOCUMENT_CHANGES
```

## Candidate demo repositories

```text
MEDUSA_STATUS=NOT_SEPARATE_GIT_REPOSITORY
SPREE_STATUS=NOT_SEPARATE_GIT_REPOSITORY
```

The separate-repository probe used `git rev-parse --show-toplevel` before
reporting either candidate status; no parent-repository identity was reported
as a candidate HEAD.

## Change accounting

`baseline.json`, `baseline-source.diff`, and `baseline-doc.diff` record the
pre-evidence capture. The baseline status hash was corrected after the initial
evidence files were written; it is therefore a capture hash, not a claim that
the source worktree was clean at the start. Existing dirty work was preserved.
