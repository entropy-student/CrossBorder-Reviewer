# BATCH-03 Runtime / CI Results

All commands were run in the existing Mother Template. The logs beside this
file are raw command output; no user environment secrets are included.

| Check | Result |
|---|---|
| `pnpm run typecheck` | `PASS_LOCAL_ONLY` |
| `pnpm run lint` | `PASS_LOCAL_ONLY` (warnings only; no errors) |
| `pnpm run test:contracts` | `PASS_LOCAL_ONLY` |
| backend unit tests | `PASS_LOCAL_ONLY` — 2 suites, 26 tests |
| `pnpm run verify` | `PASS_LOCAL_ONLY` |
| production build after existing backend startup | `PASS_LOCAL_ONLY` |
| process-management security tests | `PASS_LOCAL_ONLY` — 9/9 |
| service-identity security tests | `PASS_LOCAL_ONLY` — 7/7 |
| verification failure-injection tests | `PASS_LOCAL_ONLY` — injected failures rejected |
| staging security tests | `PASS_LOCAL_ONLY` — 37 pass, 0 fail, 1 symbolic-link skip |

The first production-build attempt was blocked only because the required local
backend listener was not running (`ECONNREFUSED 127.0.0.1:19600`). The normal
saved runtime path was started without setup/reset, and the same build then
completed successfully. The symbolic-link test was not attempted because this
non-destructive run did not request Windows link privilege; junction/reparse
protection was tested and passed.

`NEW_ORDER_CREATED=NO`, `DATABASE_RESET=NO`, `REAL_MONEY_CHARGED=NO`.
