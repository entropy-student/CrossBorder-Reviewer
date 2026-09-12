# C — Isolated integration evidence

- Network: `cb-b06r1-isolated-20260908`.
- Fresh PostgreSQL 16 and Redis 8 containers were created without a volume; readiness evidence is in `postgres-ready.log`, `redis-ready.log`, and `isolated-services-final-status.txt`.
- Final-image Medusa migration completed with exit code `0` against the isolated database. The initial timeout was reproduced and diagnosed as TLS against the deliberately plain local PostgreSQL endpoint; rerun with `?sslmode=disable` completed all module migrations, link sync, and migration scripts.
- Final-image server and worker each remained running after startup as non-root processes and exited `0` after graceful stop.
- Real Store API calls through the running final-image server returned `200` for regions, products, payment providers with region, cart creation, shipping options with cart, and the custom store route. See `store-api-final-image-current.txt`.
- Real Store API cart/line-item flow returned `200` for region lookup, cart creation, product lookup, line-item creation, and cart read-back; see `store-inventory-flow-current.txt`.
- Database read-back after seeding/flow observed 20 inventory items, 20 inventory levels, 20 positive-stock levels, 1 cart line item, and no reservation item before order completion; see `inventory-store-db-readback-after-flow.txt`.

PayPal provider Webhook/refund and provider-side read-back were not executed: the provider is disabled in this isolated run and no external Sandbox receiver/merchant chain was available.
