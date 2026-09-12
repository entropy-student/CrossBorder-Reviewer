# RT-04 / SF-11 — Unified verification and source-root CI

Status: `CLOSED_CANDIDATE` (local evidence; Reviewer decides PASS/RETURN).

## Implementation

- The template root now exposes `typecheck`, `lint`, `test`, `test:contracts`,
  `verify` and `verify:build`.
- Backend has a Windows-safe Node Jest wrapper and directly declares the
  `@medusajs/utils@2.19.0` dependency required by `jest.config.js`.
- Storefront has explicit typecheck and an ESLint wrapper for its existing
  legacy configuration. The build no longer ignores TypeScript or ESLint
  errors.
- `test:contracts` runs the existing provider boundary, Product Master
  adversarial validator and Component Master/BOM tests. No test was skipped.
- `.github/workflows/verify.yml` is at the source Git root, uses Node 20.19.0
  and pnpm 10.11.1, installs with the lockfile, invokes the same `verify` and
  `verify:build` commands, then runs the three PowerShell security suites.
- `acceptance-smoke.ps1` is explicitly marked `MUTATING TEST`; it creates
  technical orders and is not part of `verify` or the CI workflow.

The only source-level lint cleanups are type-safe corrections in the existing
cart data helper and removal of obsolete TypeScript suppression comments in
the existing language selector. No commerce or UI design behavior was
intentionally changed.

## Commands and results

| Command | Exit | Result |
|---|---:|---|
| `corepack pnpm@10.11.1 run verify` | 0 | TypeScript, backend lint, storefront lint, backend Jest, payment/product/component contracts passed |
| `corepack pnpm@10.11.1 run test:contracts` | 0 | `PAYMENT_BOUNDARY_TEST=PASS`; 26 Product cases and 19 Component/BOM cases; Product `VALIDATION_TEST_MATRIX=PASS`; Component `COMPONENT_VALIDATION_TESTS=PASS` |
| `corepack pnpm@10.11.1 run verify:build` | 0 | Medusa backend build and Next.js 15.5.24 production build passed |
| `pwsh -File scripts/verification-gate.security.tests.ps1` | 0 | Injected failing Jest test and injected TypeScript error both made their unified command nonzero; fixtures removed |

The full raw output is preserved in [UNIFIED_VERIFY_LOG.txt](UNIFIED_VERIFY_LOG.txt),
[CONTRACT_TEST_LOG.txt](CONTRACT_TEST_LOG.txt),
[PRODUCTION_BUILD_LOG.txt](PRODUCTION_BUILD_LOG.txt),
[PRODUCTION_BUILD_LOG_FINAL.txt](PRODUCTION_BUILD_LOG_FINAL.txt),
[FAILURE_INJECTION_LOG.txt](FAILURE_INJECTION_LOG.txt) and
[FAILURE_INJECTION_RUN_LOG.txt](FAILURE_INJECTION_RUN_LOG.txt).

The failure probe records the real Jest failure (`Tests: 1 failed`) with exit
1 and the real TypeScript diagnostic with exit 2. It leaves no fixture in the
source tree.

## Boundary

No PayPal or WorldFirst API was called, no credentials were requested, printed
or added, no
order was created, and no database/Docker reset was performed. CI is configured
but has not been run by a remote provider in this local execution.
