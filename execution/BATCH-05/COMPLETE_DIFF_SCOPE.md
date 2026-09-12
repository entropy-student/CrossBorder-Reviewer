# Complete Diff Scope

`COMPLETE_DIFF.patch` is generated from the canonical source repository with
binary-safe tracked diffs followed by `git diff --no-index` additions for the
30 non-ignored untracked source files. Runtime `.env`, `.runtime`, build,
cache and dependency payloads are excluded. The source Git working tree is
intentionally not staged or committed.

Generated patch SHA256 at evidence capture:

`CFEF9DC85A734F2FFD47EBBEEA1AE91A36429BC2797E7817B233C458D0DAEE4E`

Generated patch size: `469751` bytes.
