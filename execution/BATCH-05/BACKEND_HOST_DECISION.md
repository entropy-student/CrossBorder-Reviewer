# Backend Host Decision

No hosting choice was made in BATCH-05. Production deployment remains outside
the executor authority.

| Option | Fit | Trade-off |
|---|---|---|
| Medusa Cloud | native Medusa operations and managed runtime | vendor/service pricing and platform constraints |
| Railway/Render-style managed container | simple long-running Node server/worker and health checks | smaller operational surface, platform-specific rollback/Redis/DB details |
| Fly.io-style regional container | regional placement and rolling releases | more operator responsibility for volumes, networking and recovery |

Any selected host must support two long-running processes (server and worker),
health/readiness checks, at least 2 GB RAM, TLS environment variables,
migrations as a separate job, rollback and logs. No resource or cloud account
was created.
