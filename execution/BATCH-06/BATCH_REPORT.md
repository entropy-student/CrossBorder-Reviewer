# BATCH-06 execution report

STATUS=PARTIAL/BLOCKED
TASK=BATCH-06
DATE=2026-09-08

## Completed locally

- Added a production Docker build context boundary and a non-root Medusa
  server/worker/migrate entrypoint. The Dockerfile now packages the generated
  `.medusa/server` artifact instead of copying the source tree into runtime.
- Added production fail-closed validation for database, generated secrets,
  explicit HTTPS CORS, TLS Redis, and `server|worker` roles. Local artifact
  runs use the explicit existing `start-local.ps1` development path.
- Added `projectConfig.redisUrl`, an environment key prefix, and R2
  `acl:false`; public R2 media and private import/export storage are separated
  in the deployment contract.
- Added webhook Inbox create-first claim semantics, duplicate no-op behavior,
  dispatch-requested state, post-Medusa-readback applied transition, and a
  capture/order lookup seam for Payments v2 refund relations.
- Added the customer Store API response middleware coverage for variants,
  customer/promotions/taxes cart mutations, and product type/tag routes.
- Added production-inventory duplicate relation checks and draft-first publish
  ordering, plus Node 22.14 CI/Docker and rollback/Vercel/service docs.

## Verification

| Check | Exit | Result |
| --- | ---: | --- |
| `pnpm run typecheck` | 0 | PASS |
| `pnpm --dir apps/backend run test:unit` | 0 | 36/36 PASS |
| `pnpm run test:contracts` | 0 | PASS; no Medusa write |
| `pnpm --dir apps/backend run lint` | 0 | PASS |
| `pnpm run test:deploy-contract` | 0 | PASS; static Docker/R2 contracts |
| `pnpm run build` | 0 | PASS; Next 15.5.24, static-path fetch warning only |
| Docker engine reachability | 0 | PASS; Linux engine 29.7.2 is reachable |
| Docker image build (initial + retry) | 1 | BLOCKED; Docker Hub auth/network timeout before build steps |
| local runtime start | 0 | PASS; existing Postgres container reused |
| read-only health/store/PDP | 0 | PASS; 200 on IPv6 localhost |
| `pnpm audit --prod --json` | 1 | 0 critical, 0 high, 1 moderate (AJV) |
| `pnpm audit --json` | 1 | 0 critical, 0 high, 1 moderate (AJV) |

## External blocker

No public Backend host, DNS, TLS, or deployed Sandbox POST receiver exists.
Therefore exact ingress, signed webhook delivery, isolated hosted DB/Redis,
and the one authorized/capture/refund Sandbox transaction were not attempted.
No PayPal or WorldFirst API was called by this execution and no credentials
were read. The confirmed OAuth 200 remains reviewer evidence.

## Truthful non-mutation state

PAYPAL_PROVIDER_ENABLED=NO
PAYPAL_CUSTOMER_EXPOSURE=DISABLED
NEW_ORDER_CREATED=NO
DATABASE_RESET=NO
REAL_PAYPAL_API_CALLED=NO
REAL_WORLDFIRST_API_CALLED=NO
REAL_MONEY_CHARGED=NO
PRODUCT_ID=prod_01M1JG54Z6PFY802QV32EJ174D
PRODUCT_SKU=PAW-PHR-001
PRODUCT_PRICE=14.99 USD

Existing source/document repository changes were present before this batch
and were preserved. This batch did not commit, push, or create a PR.

## Docker follow-up

Docker Desktop is now reachable. The image build was retried after adding a
Dockerfile `chmod 0555` contract for the copied Linux entrypoint; the matching
static regression passed. Both build attempts stopped while Docker requested a
token for `node:22.14.0-bookworm-slim` from `auth.docker.io`, before executing
any Dockerfile build layer. No image-layer scan or runtime container start is
therefore available. The active local Medusa Compose project reports a
migration-era configuration-file path in Docker metadata; it was observed but
not mutated because doing so would require runtime reconstruction.
