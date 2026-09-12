# BATCH-02 command / exit-code index

All commands below ran from the canonical application root unless noted.
Raw stdout/stderr is retained beside this file.

| Command | Exit | Raw evidence |
|---|---:|---|
| `corepack pnpm@10.11.1 run test:contracts` | 0 | `../B-product/product-contracts.log` |
| `corepack pnpm@10.11.1 run verify` | 0 | `pnpm-verify-final.log`, `runtime-security-unified.log` |
| `corepack pnpm@10.11.1 run verify:build` | 0 | `pnpm-build-final.log` |
| `corepack pnpm@10.11.1 --dir apps/backend run build` | 0 | `backend-build-after-boundary.log` |
| `corepack pnpm@10.11.1 --dir apps/backend typecheck` | 0 | `backend-typecheck-after-boundary.log` |
| `corepack pnpm@10.11.1 --dir apps/storefront typecheck` | 0 | `storefront-typecheck-final.log` |
| `corepack pnpm@10.11.1 --dir apps/storefront build` | 0 | `storefront-build-final.log` |
| PayPal Jest unit suite | 0 | `../D-payment/paypal-unit.log` (22/22) |
| `scripts/run-runtime-security-tests.ps1` | 0 | `runtime-security-unified.log` |

The build output contains existing lint warnings only; no typecheck or build
error was observed. No mutating acceptance-smoke command was run.
