# BATCH-01 Git status and HEAD evidence

Captured after the RT-04 implementation and final local test runs on
2026-09-06.

## Document-center repository

```text
TOPLEVEL=C:/Users/34707/Documents/ChatGPT/跨境电商
HEAD=38e879c42ead6e561939a7881526c2a984c158a2
STATUS=clean (empty `git status --porcelain=v1`)
```

## Canonical source repository

```text
TOPLEVEL=C:/Users/34707/Documents/ChatGPT/跨境电商/CrossBorder-Independent-Store
HEAD=4b7dd0f371f13cc3ee1f598499dcecbf63b33fec
STATUS=dirty with this batch's intentional, uncommitted changes
```

The source worktree was intentionally not committed, pushed or reset because
the execution instructions prohibit automatic commits and require preservation
of existing uncommitted work. The complete tracked and untracked diff is in
[COMPLETE_DIFF.patch](COMPLETE_DIFF.patch).

Changed/untracked paths are limited to the RT-01-R1 staging security test and
script, RT-02 process identity guards/tests, RT-03 service identity guards/test,
RT-04/SF-11 package/CI/test-entry changes, and the explicit MUTATING comment on
`03_template/medusa-crossborder-base/scripts/acceptance-smoke.ps1`. Existing
source edits present before this batch remain preserved in the same worktree.

## Separate candidate repository detection

The check compares `git rev-parse --show-toplevel` with the expected candidate
directory; this prevents inheriting the canonical source repository identity.

| Candidate | Expected top-level | Result |
|---|---|---|
| Medusa application `03_template/medusa-crossborder-base` | application directory | `NOT_SEPARATE_GIT_REPOSITORY` (resolves to canonical source root); source HEAD above is the owning repository |
| Spree benchmark `02_demos/spree-demo` | `.../02_demos/spree-demo` | separate repository; `HEAD=f9966ab61ae0ceb72f62a51167b1c013fe10230f`; status clean |

The outer document-center repository remained clean. No database, Docker data,
orders, credentials or runtime environment files were changed.
