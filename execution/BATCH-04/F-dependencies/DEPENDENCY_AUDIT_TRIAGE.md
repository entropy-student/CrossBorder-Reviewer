# BATCH-04 Dependency Audit Triage

Audit commands were run against the canonical application with pnpm 10.11.1:

```text
pnpm audit --prod --json       EXIT_CODE=1
pnpm audit --json              EXIT_CODE=1
```

The non-zero exit code is the audit finding result, not a network failure.
Sanitized raw evidence is preserved in `pnpm-audit-prod.json` and
`pnpm-audit.json`. No automatic fix or package update was run.

## Current counts

```text
AUDIT_CRITICAL=0
AUDIT_HIGH=4
AUDIT_MODERATE=7
AUDIT_LOW=0
```

## Triage

| Package / advisory | Installed vulnerable instance(s) | Fixed version | Reachability / path | Recommendation |
|---|---|---|---|---|
| `lodash` GHSA-r5fr-rjxr-66jc / CVE-2026-4800 | `4.17.23` (a patched `4.18.1` is also present) | `>=4.18.0` | Backend CLI utility path through GraphQL Codegen; not invoked by storefront request handling in this batch. | `FIX_BEFORE_LIVE`; lockfile/override review required. |
| `lodash` GHSA-f23m-r3pf-42rh / CVE-2026-2950 | `4.17.23` | `>=4.18.0` | Same backend CLI/GraphQL Codegen transitive path. | `FIX_BEFORE_LIVE`; lockfile/override review required. |
| `sharp` GHSA-f88m-g3jw-g9cj | `0.34.5` | `>=0.35.0` | Storefront `next` image/build dependency; production image optimization is a reachable production surface. | `FIX_BEFORE_SANDBOX`; compatible patch/minor update and full regression required. |
| `postcss` GHSA-qx2v-qp2m-jg93 / CVE-2026-41305 | `8.4.31` vulnerable instance also present; `8.5.26` present | `>=8.5.10` | Storefront Next build chain; the vulnerable behavior requires an untrusted CSS processing path not used by the storefront. | `FIX_BEFORE_LIVE`; lockfile/override review. |
| `postcss` GHSA-6g55-p6wh-862q / CVE-2026-45623 | `8.4.31` vulnerable instance also present; `8.5.26` present | `>=8.5.12` | Same build-only dependency path. | `FIX_BEFORE_LIVE`; lockfile/override review. |
| `postcss` GHSA-fxqj-rqcc-2cmp / CVE-2026-69153 | `8.4.31` vulnerable instance also present; `8.5.26` present | `>=8.5.23` | Same build-only dependency path. | `FIX_BEFORE_LIVE`; lockfile/override review. |
| `postcss` GHSA-r28c-9q8g-f849 / CVE-2026-73646 | `8.4.31` vulnerable instance also present; `8.5.26` present | `>=8.5.18` | Same build-only dependency path. | `FIX_BEFORE_LIVE`; lockfile/override review. |
| `ajv` GHSA-2g4f-4pwh-qvx6 / CVE-2025-69873 | `8.13.0` and `6.15.0` vulnerable instances; `8.20.0` present | `>=8.18.0` (v8) | Backend CLI/MikroORM migration tooling; no `$data`-enabled request validator was identified in the storefront path. | `FIX_BEFORE_LIVE`; lockfile/override review. |
| `uuid` GHSA-w5hq-g745-h8pq / CVE-2026-41907 | `9.0.1` vulnerable instance; `11.1.1` present | `>=11.1.1` | Backend event-bus/BullMQ transitive runtime path; current application code does not invoke the vulnerable v3/v5/v6 buffer API. | `FIX_BEFORE_SANDBOX`; compatible resolution and regression required. |
| `qs` GHSA-x5fp-wj9c-mxmx / CVE-2026-82562 | `6.15.3` | `>=6.16.0` | Storefront transitive query-string path; no `comma=true` untrusted round-trip was identified in current code. | `FIX_BEFORE_LIVE`; lockfile/override review. |
| `qs` GHSA-4mjr-xmp4-gh2g / CVE-2026-82417 | `6.15.3` | `>=6.16.0` | Same storefront transitive path; no vulnerable parse/stringify round-trip was identified in current code. | `FIX_BEFORE_LIVE`; lockfile/override review. |

The advisory paths and package versions are taken from the local audit JSON and
lockfile. The audit is current as of the execution date; registry results may
change. The BATCH-04 scope does not authorize dependency updates, so the
remaining high findings are a release gate, not a claim of security closure.

`DEPENDENCY_AUDIT=AVAILABLE`
`DEPENDENCY_UPDATE_PERFORMED=NO`
`PRODUCTION_AUDIT_TARGET=CRITICAL_0_HIGH_0`
