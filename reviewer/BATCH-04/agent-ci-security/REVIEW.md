# BATCH-04 CI / Security / Production Deployment Independent Review

Review date: 2026-09-07 (Asia/Shanghai)

Scope: CI and clean build evidence, dependency audit, storefront security headers, runtime configuration, and deployment feasibility for Vercel + Supabase PostgreSQL + Upstash Redis + Cloudflare R2/DNS + Resend. The canonical source and document repositories were read only. No payment credential was read, copied, tested, or written here.

## Decision

```text
BATCH04_CI_SECURITY_RUNTIME=RETURN
LOCAL_WINDOWS_BUILD_BASE=PASS_WITH_EVIDENCE_CORRECTION
REMOTE_CI=NOT_PROVEN
PRODUCTION_DEPLOYMENT=RETURN
DEPENDENCY_RELEASE_GATE=RETURN
```

BATCH-04 improves the local engineering baseline, but it does not define or verify a deployable production system. Vercel is suitable for the Next.js storefront. The Medusa backend still requires a persistent server deployment and a separate worker deployment; neither exists in the repository or the supplied hosting decision. Redis, R2 and Resend are selected services only—the application does not configure their Medusa modules.

## Findings

### P0 — Rotate the live PayPal secret before any use

A live application secret was supplied in conversation text. Treat it as disclosed. Revoke/rotate it in PayPal, store only the replacement in the production secret manager, and never reuse the disclosed value in sandbox, preview, CI, repository files, review evidence, or logs. This review intentionally did not reproduce or test the credential.

### P1 — Vercel does not complete the Medusa production topology

The codebase has one Medusa `start` command but no production service definitions, no worker deployment, and no `workerMode` configuration. `apps/backend/medusa-config.ts:81-93` only configures project HTTP/database and optional PayPal modules. Medusa's current production guide calls for PostgreSQL, Redis, and separate server and worker instances; it also recommends at least 2 GB RAM for the hosting plan: https://docs.medusajs.com/learn/deployment/general and https://docs.medusajs.com/learn/production/worker-mode.

Vercel Functions have bounded invocation duration and are not evidence of a continuously running Medusa worker: https://vercel.com/docs/functions/configuring-functions/duration. Therefore:

- Vercel storefront: `CONDITIONAL_PASS`.
- Medusa API and Admin on Vercel Functions: `RETURN`.
- Medusa background worker on Vercel Functions: `RETURN`.
- A persistent container/VM/PaaS target for two backend process roles is still required.

### P1 — Upstash Redis, Cloudflare R2 and Resend are not integrated

`apps/backend/medusa-config.ts:81-93` registers no Redis caching, event bus, workflow engine, locking, S3 file, or notification provider. `apps/backend/.env.template:5` declares `REDIS_URL`, but application source does not consume it. The backend package does not declare the production providers as direct dependencies. No R2 or Resend environment contract exists.

Medusa recommends Redis caching/event/workflow/locking and an S3-compatible file provider in production: https://docs.medusajs.com/learn/deployment/general. Cloudflare R2 is S3 compatible and requires an endpoint plus scoped credentials: https://developers.cloudflare.com/r2/get-started/s3/. Upstash exposes a TLS Redis protocol URL compatible with ioredis (`rediss://...`): https://upstash.com/docs/redis/search/adapters/ioredis. Resend requires an implemented Notification provider plus a verified sending domain: https://docs.medusajs.com/resources/integrations/guides/resend and https://resend.com/docs/dashboard/domains/introduction.

Until these modules are configured and integration-tested, uploaded assets remain on Medusa's development local-file provider, events/workflows/locks do not have the intended Redis durability, and transactional email is absent.

### P1 — Supabase PostgreSQL deployment and migrations are incomplete

`apps/backend/package.json:15-24` has no `predeploy` or migration command. The repository contains no release job that runs `medusa db:migrate` exactly once before new server/worker instances start. `medusa-config.ts:83` accepts `DATABASE_URL` without production validation for presence or transport requirements.

Supabase documents direct connections for migrations and long-lived backends, session pooler mode for persistent IPv4 clients, and transaction pooler mode for serverless/short-lived clients; transaction mode does not support prepared statements: https://supabase.com/docs/guides/database/connecting-to-postgres. The selected Medusa topology should use direct connectivity where supported or Supavisor session mode for the persistent backend, with a separately controlled migration connection/job. SSL, connection limits, backups/PITR, migration rollback and staging isolation remain unverified.

### P1 — “Clean verify” evidence is mislabeled and remote CI remains unproven

`.github/workflows/verify.yml:12` runs only `windows-2022`; Vercel and normal backend container targets are Linux. There is no Linux build/type/test job to catch path casing, shell, native binary, and filesystem differences. The workflow is currently untracked, the repository has no configured Git remote, and BATCH-04 states `REMOTE_GITHUB_ACTIONS=NOT_RUN_REMOTE`.

The two “clean checkout” directories contain no `.git` directory. They are filtered filesystem copies, not checkouts from a committed revision. More importantly, `A-ci-clean-checkout/clean-final-verify.log` runs `typecheck`, `test:contracts`, and storefront `next build`; it does not run the root `pnpm run verify` despite the summary claiming `TOP_LEVEL_VERIFY=PASS`.

An independent run in the Executor's isolated copy confirmed typecheck, lint, 31 unit tests, contracts, and RT-02/03/04. It was stopped during the long RT-01 packaging stage to avoid expanding the review; therefore it does not repair the missing full-clean-verification claim. Evidence: `independent-clean-full-verify.log`.

Required correction: create a commit-addressable clean worktree/clone, run the exact CI commands on Windows and Linux, record exit codes, and run the hosted workflow. CI must test the same committed tree that will deploy.

### P1 — Dependency release gate still fails

The current production audit is `0 critical / 4 high / 7 moderate / 0 low` across 1,166 production dependencies. High findings include a runtime-reachable `sharp` path through Next.js, vulnerable PostCSS instances in the storefront build chain, and lodash in backend CLI/codegen tooling. Moderate findings include direct storefront `qs`, backend tooling `ajv`, and Redis event-bus `uuid` paths.

The Executor's triage is useful, but no compatible remediation or post-update regression exists. The agreed production target `critical=0/high=0` is unmet. Dependency status: `RETURN_BEFORE_LIVE`. Avoid broad blind overrides; update the owning top-level packages or use narrowly justified resolutions, then rerun frozen install, build, tests, image processing, and `pnpm audit --prod`.

### P1 — CSP is both too permissive and incompatible with the proposed live topology

`apps/storefront/next.config.js:47-78` now adds security headers, but:

- `script-src` includes both `'unsafe-inline'` and `'unsafe-eval'` in production (`:53`).
- PayPal allowlists contain only sandbox origins (`:57-61`); enabling a live flow would be blocked.
- The policy does not derive the distinct production Backend and R2 asset origins from reviewed environment variables.
- `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` permit same-origin framing where no embedding requirement is documented.
- BATCH-04 only records `SECURITY_HEADERS=IMPLEMENTED_IN_NEXT_CONFIG`; it does not capture actual HTTP response headers or browser CSP violations.

Build environment-specific CSPs, remove `unsafe-eval` from production, narrow scripts with nonces/hashes where the framework permits, add only the selected live endpoints, and add automated response-header/CSP smoke tests. Keep payment exposure disabled until the live policy is verified.

### P2 — The selected domain is delegated but not routed

Read-only DNS probing on 2026-09-07 found `spikspikeapi.dpdns.org` delegated to Cloudflare nameservers, but no A, AAAA, or CNAME record; HTTPS could not resolve. DNS management is established, but production routing is not.

Define separate reviewed origins for the Vercel storefront, Medusa API/Admin/webhook endpoint, and R2 public asset domain. Then configure Cloudflare DNS/TLS, exact Medusa CORS values, PayPal return/cancel/webhook URLs, Vercel environment variables, and end-to-end HTTPS checks. R2's `r2.dev` URL is development-only; use a custom domain for production assets: https://developers.cloudflare.com/r2/buckets/public-buckets/.

### P2 — Production environment validation and deploy contract are missing

`apps/storefront/check-env-variables.js:3-10` checks only the publishable key. The backend validates PayPal credentials when enabled but does not fail closed on missing/placeholder database, Redis, CORS, JWT/cookie, R2 or notification settings. `medusa-config.ts:42-46` explicitly blocks PayPal production transport, so a live deployment cannot yet enable the selected live app.

There is no `vercel.json` or repository deployment runbook that fixes the Vercel root directory, Node/pnpm version, build command, output, production/preview environment separation, region, and health checks. Vercel supports selecting a monorepo root, but it must be configured explicitly: https://vercel.com/docs/monorepos.

### P2 — The support mailbox is not a production sender identity

The supplied QQ mailbox can be the public support contact or Resend `Reply-To`. It should not be treated as proof of a verified Resend sending domain. Configure a sender subdomain under the controlled DNS zone, publish SPF/DKIM and preferably DMARC, and use a domain address for `From`; keep the QQ mailbox as a monitored reply/escalation destination. The named operational owner can be recorded as `spikewang`.

## What passed

- Locked install contract uses Node `20.19.0` and pnpm `10.11.1` in the workflow (`verify.yml:30-44`).
- Workflow permissions are limited to `contents: read` (`verify.yml:7-8`).
- A filtered fresh filesystem copy completed frozen install and a storefront build with an unreachable backend.
- The storefront production config enables Next image optimization (`next.config.js:21-22`) and includes HSTS in production (`:71-75`).
- Independent isolated verification reached typecheck, lint, 31/31 unit tests, contracts, RT-02, RT-03 and RT-04 successfully. Lint emitted seven PayPal transport warnings and is not a zero-warning gate.
- Local `.env`, `.env.local`, `.vercel`, build and runtime artifacts are ignored. Tracked environment files inspected contained templates/placeholders rather than deploy secrets.

## Deployment feasibility matrix

| Component | Decision | Required closure |
|---|---|---|
| Vercel Next.js storefront | Conditional PASS | Configure monorepo root/build/env, Linux CI, real domain and deployment smoke |
| Medusa API/Admin | RETURN | Choose persistent compute, server mode, health/rollback/observability |
| Medusa worker | RETURN | Separate persistent worker deployment with Redis-backed modules |
| Supabase PostgreSQL | Conditional | Connection mode, SSL, migration job, backups/PITR, load limits |
| Upstash Redis | Conditional | Configure Medusa Redis modules with TLS URL and run integration/failover tests |
| Cloudflare R2 | Conditional | Configure S3 provider, scoped token, endpoint/bucket/public asset domain and upload/read/delete tests |
| Cloudflare DNS/domain | Partial | Delegation exists; records, TLS, host split and HTTPS checks absent |
| Resend | Conditional | Notification provider, verified sender subdomain, SPF/DKIM/DMARC and delivery/bounce tests |
| Dependency security | RETURN | Reach `0 critical / 0 high` and regress |

## Recommended execution order

1. Rotate the disclosed PayPal live secret. Do not place its replacement in chat or files.
2. Freeze the production topology: Vercel storefront plus a persistent Medusa server and worker host.
3. Implement production configuration validation, Supabase migration/runtime connection strategy, Upstash Redis modules, R2 file provider and Resend notifications.
4. Remediate high dependency advisories and rerun the entire gate.
5. Fix environment-specific CSP and test real response headers.
6. Add Linux CI and run the hosted workflow against a committed revision.
7. Configure DNS/TLS and deploy an isolated staging environment; verify migrations, restart/replay, upload/read/delete, email delivery, health and rollback.
8. Only then proceed to the controlled PayPal sandbox vertical transaction and later live acceptance.

## Do not change now

- Do not redesign the frozen Medusa/Figma/Web UI.
- Do not change the selected product, price, image, or return to product selection.
- Do not enable live PayPal or customer payment exposure before secret rotation and the production gates above.
- Do not invent inventory, shipping, package, HS/compliance, return, tax, or fulfillment facts that remain unknown.
- Do not treat a local build, Cloudflare DNS delegation, or provider account creation as production readiness.

