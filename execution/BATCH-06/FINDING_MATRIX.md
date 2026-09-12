# BATCH-06 finding matrix

| Area | Local result | Evidence / remaining gate |
| --- | --- | --- |
| Docker secrets/artifact | PARTIAL | Static boundary PASS; image/layer scan blocked by Docker Hub network |
| Production config | PASS locally | Contract tests PASS; real managed Redis/R2 deployment untested |
| R2 ACL/public boundary | PASS statically | `acl:false` asserted; isolated R2 request not run |
| Webhook claim/replay | PARTIAL | create-first/unit seam implemented; concurrent DB and HTTP proof pending |
| Applied state | PASS by contract | only explicit post-readback method marks applied; live Medusa readback pending |
| Refund/reversal/dispute | PARTIAL | durable operation model/seam added; external convergence worker and provider readback pending |
| Inventory ordering | PASS by code contract | isolated Medusa create/rerun/concurrency proof pending |
| Store API privacy | PARTIAL | route coverage added; full HTTP matrix pending |
| CI/Node/Vercel/rollback | PASS locally/docs | remote CI, Preview deployment and backend host not selected |
| Browser matrix | PARTIAL | existing checkout/cart browser baseline; 320/375/768/1440/200% new capture pending |
| Sandbox vertical | BLOCKED | no public receiver/backend host/DNS/TLS; no transaction attempted |

The batch is not marked PASS or CLOSED by the execution agent.
