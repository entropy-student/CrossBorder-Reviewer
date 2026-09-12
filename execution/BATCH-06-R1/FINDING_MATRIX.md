# BATCH-06-R1 Finding Matrix

| Area | Evidence state | Evidence |
|---|---|---|
| Docker build | Observed locally through accessible registry mirror; completed no-cache run | `A-docker/docker-build-clean-no-pull-final.log`, `A-docker/docker-build-clean-no-pull-final.exitcode.txt` |
| Base digest / layer scan | Observed; all 14 current layer blobs and the application artifact have zero high-confidence secret-value and PEM-payload matches | `A-docker/base-image-inspect-current.txt`, `A-docker/image-layer-scan-summary-current.txt`, `A-docker/artifact-secret-scan-current-tag.txt` |
| Artifact cwd / entrypoint | Observed in final image | `A-docker/runtime-smoke-current.txt`, `A-docker/artifact-cwd-cli-help-current.txt` |
| migrate | Observed exit 0 on isolated PostgreSQL for current image tag | `C-integration/medusa-migrate-current-tag-current.exitcode.txt` |
| server / worker | Current image tag observed running, server health 200/OK, and graceful exit 0 | `C-integration/runtime-current-tag-current.txt`, `C-integration/runtime-container-shutdown-current.txt` |
| Isolated DB/Redis | Observed ready; production TLS Redis connections established in patched image | `C-integration/isolated-services-final-status.txt`, `C-integration/production-tls-patched-server-current.log`, `C-integration/production-tls-patched-worker-current.log` |
| Store API / inventory | Current image tag observed real internal HTTP (9 cases all 200) and DB read-back | `C-integration/store-api-current-tag-with-key-current.txt`, `C-integration/store-api-current-tag-db-readback.txt` |
| Durable reconciliation DB path | Observed real isolated PostgreSQL Webhook dedupe/status, concurrent claim/replay, restart-boundary replay, and refund operation persistence/read-back through compiled module; patched production image also connected to isolated TLS Redis; local retrieve seam only | `B-paypal-durable/isolated-db-durable-fixed-current.log`, `B-paypal-durable/isolated-db-concurrency-result-current.md`, `B-paypal-durable/isolated-db-durable-patched-image-production-current.log`, `B-paypal-durable/paypal-enabled-patched-image-production-migrate-current.log` |
| Webhook / refund with provider | Not executed | `B-paypal/RESULT.md`, `B-paypal-durable/BLOCKED.md` |
| Backend host / DNS / TLS receiver | Blocked external prerequisite | `D-platform/BLOCKER.md` |
| Sandbox AUTHORIZE 14.99 / capture / refund | Not executed because conditional gate was not met | `F-paypal-sandbox/RESULT.md` |
| Live | Closed; no Live secret or endpoint used | `B-paypal/RESULT.md`, `USER_ACTION_PACKET.md` |
| Browser hosted matrix | Not executed without hosted target | `E-browser/RESULT.md` |

Disposition: `PARTIAL/BLOCKED`. This matrix does not announce PASS or CLOSED.
