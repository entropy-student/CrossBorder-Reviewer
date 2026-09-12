# BATCH-06-R1 Execution Report

## Disposition

`PARTIAL/BLOCKED`

This is an execution evidence report, not a PASS or CLOSED declaration.

## Completed evidence

The current Medusa production artifact was rebuilt in Docker through the accessible registry mirror. The image is non-root, contains the artifact and CLI at the verified paths, and its entrypoint dispatches `migrate`, `server`, and `worker` from the artifact workdir. The baseline image was exercised against fresh isolated PostgreSQL and Redis containers: migration completed, server and worker remained up, graceful stop returned exit code 0, and Store API/cart/line-item/inventory read-back checks returned expected HTTP/database results. After a surgical reconciliation fix, the backend build completed with exit code 0 and a real incremental Docker build produced `cb-batch06-r1-medusa:20260908-patched`; its production migrate/server/worker runs connected to an isolated TLS Redis and server health returned 200.

The successful build is a real no-cache Docker build against the locally verified mirror-resolved base digest. A separate direct `--pull` attempt failed at Docker Hub token authorization; that failure is preserved in `A-docker`, while the completed no-cache mirror run is the current build evidence.

Static and local code evidence also completed: Docker and R2 boundary tests, payment/product/inventory contract tests, all 37 backend unit tests, backend/storefront typechecks, and backend/storefront lint. The current image tag also passed a 9-case Store API/cart/line-item/shipping HTTP probe and DB inventory read-back. The patched reconciliation module passed real isolated PostgreSQL Webhook dedupe/status, concurrent claim/replay, restart-boundary replay, and refund operation persistence/read-back using a local deterministic retrieve seam. The full evidence is in the subdirectories of this folder.

## Remaining blockers

The environment had no approved Backend host/project, public HTTPS receiver, DNS/TLS ingress, or Sandbox merchant/buyer deployment chain. Consequently, the requested real signed PayPal Webhook, provider refund/read-back, and the conditional one-time Sandbox `14.99 USD AUTHORIZE` → capture/refund/read-back sequence could not be executed. No Live secret was read and no Live endpoint was called.

The local Store API run used a plain PostgreSQL container with `sslmode=disable`; production-style TLS Redis startup was separately verified with an ephemeral isolated TLS Redis and test-only S3 URL configuration. This is local infrastructure evidence, not hosted deployment evidence.

See `USER_ACTION_PACKET.md` for the single external prerequisite packet required to continue.
