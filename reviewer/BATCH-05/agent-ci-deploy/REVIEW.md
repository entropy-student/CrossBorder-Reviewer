# BATCH-05 CI / Deployment Independent Review

Reviewed at: 2026-09-07 (Asia/Shanghai)

Scope: CI, dependency audit, Vercel Storefront, Medusa server/worker packaging,
Supabase PostgreSQL, Upstash Redis, Cloudflare R2, Resend, DNS, rollback and
secret boundaries. The source project was read only. No deployment, cloud
resource, DNS change, email, database write or secret read was performed.

## Decision

`CI_AND_DEPLOYMENT_SLICE=RETURN`

The local verification work is useful, and the production service choices are
reasonable. The checked-in deployment package is not safe or executable enough
to call launch ready. It contains two P0 secret/runtime defects and several P1
configuration and recovery gaps.

| Area | Result | Reason |
|---|---|---|
| Local CI definition | PARTIAL PASS | Windows/Linux jobs exist and pin the lockfile toolchain, but neither remote job has run. Linux omits Storefront lint and all PowerShell runtime tests. |
| Dependency audit | CONDITIONAL PASS | 0 critical, 0 high, 1 moderate. The remaining AJV advisory is conditional on `$data: true`; no reviewed application path enables it. Track and remove it before or shortly after launch, but it does not justify blocking Sandbox by itself. |
| Vercel Storefront | RETURN | Documented Root Directory and Build command contradict each other; the documented command fails. Node version, R2 image hostname and a real Preview deployment are not proven. |
| Medusa container/server/worker | RETURN | Local `.env` files would be copied into the image; runtime copies the entire build tree; start command does not use the official `.medusa/server` artifact; production can silently fall back to local/in-memory infrastructure. |
| Supabase PostgreSQL | RETURN | Direct/session-pooler direction is correct, but no host-specific connection mode, SSL check, backup tier, restore drill or migration rollback procedure is selected. |
| Upstash Redis | RETURN | Native TLS/module registration are correct, but Medusa session Redis is not configured; worker/server isolation, capacity/eviction and queue retention are not specified or tested. |
| Cloudflare R2 | RETURN | S3 endpoint/region shape is broadly correct, but current provider sends unsupported S3 ACL headers, public/private claims are inconsistent, and the Storefront does not document the R2 image hostname. |
| Resend | HOLD | Correctly not enabled, but production email does not exist. The QQ address can be support/reply-to; it cannot be the verified Resend sender for this domain. |
| DNS | HOLD | Zone delegation to Cloudflare is visible, but apex, `www`, `api`, `assets`, MX and TXT records are absent. This matches the executor's HOLD, not launch readiness. |
| Rollback | RETURN | `deploy/README.md` names a missing `rollback.md`, and its Backend Host Decision relative link resolves to the wrong directory. No DB restore runbook exists. |

## Findings

### P0 — Docker build can embed ignored local credentials

Evidence:

- `deploy/medusa/Dockerfile:8` uses `COPY . .`.
- `deploy/medusa/Dockerfile:15` copies the complete `/app` build stage into the
  runtime image.
- No `.dockerignore` exists at the build-context root.
- `apps/backend/.env` and `apps/storefront/.env.local` both exist locally. Their
  contents were not read.
- Git ignore rules do not affect Docker build contexts.

Impact: a local or CI image build can permanently place database, PayPal or
other runtime credentials in an image layer and in the final image filesystem.

Required correction:

1. Add a build-context `.dockerignore` that excludes `.env*`, `.runtime`, `.git`,
   `node_modules`, generated artifacts, evidence and local state while explicitly
   retaining only required templates/source files.
2. Build from a clean checkout and prove no `.env`/secret-pattern file exists in
   any image layer or final filesystem.
3. Copy only the production artifact and required runtime dependencies into the
   final image; run as an unprivileged user.

### P0 — Production infrastructure is opt-in and can silently use local state

Evidence:

- `apps/backend/medusa-config.ts:8` defaults
  `MEDUSA_PRODUCTION_INFRASTRUCTURE_ENABLED` to false even with
  `NODE_ENV=production`.
- Redis/S3 production modules are omitted entirely at lines 16-66 when that flag
  is absent.
- `projectConfig` at lines 100-111 does not set `redisUrl`, so Medusa sessions
  remain in memory even when all four Redis modules are configured.
- `workerMode` defaults to `shared` at line 110; production does not require
  exactly `server` or `worker`.
- No `admin.disable` configuration exists for the worker instance.

This contradicts the stated fail-closed behavior. Medusa's current deployment
guide requires server and worker instances, Redis session configuration, and a
disabled Admin in the worker.

Required correction:

1. Under `NODE_ENV=production`, require production infrastructure rather than
   accepting a missing opt-in flag.
2. Require `MEDUSA_WORKER_MODE=server|worker`; reject `shared` in production.
3. Set `projectConfig.redisUrl` and production-safe Redis options/prefixes.
4. Set `admin.disable` from the worker role and prove the worker does not expose
   Admin/API listeners.
5. Add production-config contract tests for missing/invalid DB, CORS, JWT,
   cookie, Redis and S3 values.

Official references:

- https://docs.medusajs.com/learn/deployment/general
- https://docs.medusajs.com/learn/production/worker-mode
- https://docs.medusajs.com/learn/configurations/medusa-config

### P0 — R2 is incompatible with the current default S3 ACL behavior

Evidence:

- `medusa-config.ts:46-63` registers `@medusajs/file-s3` for R2-like settings but
  does not set its `acl` option to false.
- The installed `@medusajs/file-s3` 2.19.0 implementation resolves each upload
  to `public-read` or `private` and sends an `ACL` field by default.
- Cloudflare R2's current S3 compatibility table marks `x-amz-acl` unsupported
  for `PutObject` and multipart uploads.
- `deploy/managed-services.md:21-22` says public assets and private assets can
  coexist safely, while an R2 custom domain makes the connected bucket public.

Impact: uploads can fail, and placing private imports/exports in the same bucket
behind a public custom domain can expose them.

Required correction:

1. Configure/test the provider with ACL headers omitted (`acl: false`) against an
   isolated R2 bucket.
2. Make the storage boundary explicit: a public product-media bucket/custom
   domain must not contain private import/export files. Use a separate protected
   bucket/provider path or disable private-file flows until implemented.
3. Restrict the R2 token to Object Read & Write on the single intended bucket.
4. Add the R2 custom hostname/path to the Storefront image configuration and
   verify image optimization from Preview.
5. Configure only the CORS methods/origins actually required; disable `r2.dev`
   for production.

Official references:

- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/buckets/public-buckets/
- https://developers.cloudflare.com/r2/buckets/cors/
- https://docs.medusajs.com/resources/infrastructure-modules/file/s3

### P1 — Container does not run the official Medusa production artifact

Evidence:

- Build creates `apps/backend/.medusa/server` (`Dockerfile:9`).
- Final command runs `pnpm --dir apps/backend start` from source
  (`Dockerfile:18`, Backend `package.json:18-20`).
- Medusa's current build guide says to install and start from `.medusa/server`.

Required correction: package `.medusa/server` as the runtime work directory,
install its generated lockfile dependencies there, and use its `start` command.
Run image-level tests for both roles plus a migration job before accepting the
artifact.

Official reference: https://docs.medusajs.com/learn/build

### P1 — Vercel instructions are internally inconsistent

Evidence:

- `deploy/vercel.md:5-6` sets Root Directory to
  `.../apps/storefront`.
- Line 10 then runs `pnpm --dir apps/storefront build`, which is a monorepo-root
  command, not an app-root command.
- Executing that documented build command from the documented root exits 1 with
  `ENOENT`; see `vercel-documented-command-probe.log`.
- No `vercel.json` or real Preview deployment evidence exists.
- The document omits the R2 image hostname/path variables used by
  `next.config.js:8-44`.

Choose and test one coherent model:

- App Root Directory: allow Vercel/pnpm framework detection and use `pnpm build`;
  ensure source outside Root Directory is included for the workspace lockfile.
- Monorepo Root Directory: use `pnpm --dir apps/storefront build`.

Pin the Vercel Node major, separate Preview/Production environment values, then
prove Preview routes, image optimization, headers and backend CORS before
promotion.

Official references:

- https://vercel.com/docs/monorepos
- https://vercel.com/docs/monorepos/monorepo-faq

### P1 — Node 20 is already EOL and is about to be disabled on Vercel

Evidence:

- CI pins Node 20.19.0 at `.github/workflows/verify.yml:33,74`.
- Docker pins `node:20.19-bookworm-slim` at lines 1 and 11.
- Vercel announced Node 20 will be disabled for new deployments on 2026-10-01.

Move CI, Storefront deployment and Backend image to one supported Node major
(Node 22 is the lower-risk compatibility step), reinstall the frozen lockfile,
and rerun every gate and image smoke test.

Official reference:
https://vercel.com/changelog/node-js-20-is-being-deprecated

### P1 — Supabase database plan lacks an executable connection/recovery contract

The high-level statement in `deploy/managed-services.md:5-8` is directionally
correct. Still missing:

- Selected Backend host and whether it has IPv6.
- Exact mode: direct `:5432` for IPv6 persistent hosts/migrations, or Supavisor
  session mode `:5432` for IPv4-only persistent hosts. Transaction mode `:6543`
  must not be used for Medusa migrations/session behavior.
- TLS verification, connection budget and environment separation.
- Backup plan, retention/RPO/RTO, pre-migration backup, restore drill and owner.

Supabase's current documentation recommends direct connections for persistent
backends and migrations, session pooler for IPv4-only persistent backends, and
states transaction mode does not support prepared statements. Daily backups are
plan-dependent and restoration causes downtime.

Official references:

- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/platform/backups

### P1 — Upstash is registered for modules but not operationally ready

Pass: native TLS `rediss://` validation and caching/event/workflow/locking module
registration at `medusa-config.ts:18-44` match the current Medusa/Upstash shape.

Return items:

- Add Medusa's session `projectConfig.redisUrl`.
- Use separate Redis databases or strict namespaces for Preview and Production.
- Set/verify BullMQ completed/failed job retention and alerting.
- Establish connection, storage, throughput and eviction behavior for the chosen
  Upstash plan. Upstash rejects writes when capacity is full if eviction remains
  disabled, which can stop events/workflows.
- Run isolated server+worker concurrency and restart tests against the selected
  Upstash database.

Official references:

- https://docs.medusajs.com/resources/architectural-modules/event/redis
- https://upstash.com/docs/redis/features/eviction
- https://upstash.com/docs/redis/search/adapters/ioredis

### P1 — Rollback and documentation integrity are incomplete

Evidence:

- `deploy/README.md:10` advertises `rollback.md`; the file does not exist.
- Its relative host-decision link at line 13 resolves to
  `C:\Users\34707\Documents\跨境电商-review\...`, not the actual Review directory;
  see `deployment-link-probe.log`.
- No process ties a release artifact to migration ID, DB backup/restore point,
  Storefront deployment, Backend server/worker image and DNS state.

Create a real runbook with: preflight, backup, migration, server/worker rollout,
health/readiness, smoke test, payment-off default, promotion, rollback trigger,
application rollback, forward/DB rollback decision, recovery verification and
named owner. Vercel rollback only changes the Storefront deployment; it does not
undo DB migrations, Backend images, external payment actions or changed secrets.

Official reference: https://vercel.com/docs/instant-rollback

### P2 — Resend is a valid later step, not a completed service

`deploy/managed-services.md:24-28` correctly keeps notification readiness on
HOLD. There is no Resend provider, API-key validation, verified sender domain,
template, retry/deduplication or delivery evidence in the project. Before launch,
implement at least order confirmation, payment/refund status and account recovery
mail. Use a verified address on the controlled domain as `From`; use the supplied
QQ mailbox as support/reply-to if desired.

Official references:

- https://docs.medusajs.com/resources/integrations/guides/resend
- https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend

### P2 — DNS is delegated but intentionally empty

Read-only DNS on 2026-09-07 found Cloudflare nameservers, but no A/AAAA/CNAME/MX/
TXT at the zone apex and no A record for `www`, `api` or `assets`. This is an
honest external HOLD. Apply records only after the Vercel project, Backend host,
R2 custom domain, TLS and exact CORS origins exist. Avoid promising a rollback
that depends only on DNS TTL; retain provider-native rollback for each service.

## Required execution order

1. Fix Docker secret boundary, `.medusa/server` packaging, production fail-closed
   validation, session Redis and worker Admin disable.
2. Fix/test R2 ACL/public-private design in an isolated bucket.
3. Move CI/images to Node 22 and run clean Windows, Linux and container tests.
4. Correct Vercel root/build instructions and create a non-production Preview.
5. Select the Backend host; then bind the correct Supabase/Upstash connection
   modes and run server+worker+restart/concurrency tests.
6. Add backup/restore/rollback runbook and perform an isolated restore drill.
7. Configure DNS, R2 custom domain and Resend only after their target resources
   exist. Keep customer payment disabled throughout.

## Dependency advisory disposition

`AJV_MODERATE=RISK_ACCEPT_FOR_SANDBOX_ONLY`

The advisory is GHSA-2g4f-4pwh-qvx6 (AJV ReDoS when `$data` is enabled). The
remaining production path is Medusa CLI -> MikroORM migrations -> umzug ->
Rushstack -> AJV 8.13.0. No reviewed project code creates AJV with `$data: true`,
and the vulnerable schema surface is not an untrusted customer input here. Do
not use a broad AJV override that disturbs ESLint. Track a compatible Medusa/
Rushstack update or prove a narrowly scoped override in clean CI. Reassess before
production promotion; this advisory is lower priority than the P0 secret and
infrastructure-fallback defects.

Official advisory:
https://github.com/advisories/GHSA-2g4f-4pwh-qvx6

## Evidence files

- `secret-boundary-probe.log`
- `vercel-documented-command-probe.log`
- `deployment-link-probe.log`
- `dns-probe.log`
- `dependency-reachability.log`
- `supabase-changelog-scan.log`

