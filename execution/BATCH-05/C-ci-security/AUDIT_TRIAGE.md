# Dependency Audit Triage

Commands:

- `corepack pnpm@10.11.1 audit --prod --json` -> exit `1`
- `corepack pnpm@10.11.1 audit --json` -> exit `1`

Both current reports are sanitized and saved beside this file as
`pnpm-audit-prod.json` and `pnpm-audit.json`.

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Moderate | 1 |
| Low | 0 |

## Moderate advisory

- Advisory: `GHSA-2g4f-4pwh-qvx6`; `CVE-2025-69873`.
- Package: `ajv`, installed `8.13.0`.
- Vulnerable range: `>=7.0.0-alpha.0 <8.18.0`.
- Fixed version: `>=8.18.0`.
- Direct/transitive: transitive, production dependency graph as reported by
  pnpm (`@medusajs/cli -> @medusajs/deps -> @mikro-orm/migrations -> umzug ->
  @rushstack/... -> ajv`).
- Reachability: advisory requires AJV `$data` option; current application code
  does not invoke that surface in the reviewed paths. This is not a claim that
  the package is globally unreachable.
- Remediation: `NEEDS_MORE_EVIDENCE`; do not apply a global override because it
  breaks the installed ESLint dependency graph. Reconcile with the Medusa
  dependency release/lockfile before sandbox enablement.
- Reviewer recommendation: `FIX_BEFORE_SANDBOX` if a compatible Medusa
  dependency update is available; otherwise reviewer acceptance of the
  documented transitive reachability assessment is required.

No automatic fix or dependency upgrade was run.
