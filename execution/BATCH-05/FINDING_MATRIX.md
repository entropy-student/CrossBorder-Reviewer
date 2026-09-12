# BATCH-05 Finding Matrix

| BATCH-04 finding | BATCH-05 result | Evidence / remaining gate |
|---|---|---|
| R1 event inbox only model | PARTIAL CLOSED LOCALLY | migration, unique index, provider seam and isolated DB proof; external replay/restart/concurrency still sandbox/DB gate |
| R2 refunds session-local | PARTIAL CLOSED LOCALLY | provider refund GET/read-back and pending-safe path; real provider convergence/concurrency still SANDBOX_REQUIRED |
| R3 no Medusa payment integration | BLOCKED EXTERNAL | config/provider boundary and route guards pass; real Store API PayPal session blocked by OAuth 401 |
| R4 inventory fixed POST | CLOSED LOCALLY | read-before-create/update plan and tests; real isolated Medusa inventory concurrency not run, production write disabled |
| R5 Store API projection incomplete | CLOSED LOCALLY | expanded route matrix and projection tests; real PayPal payment-session response not exercised |
| R6 deployment architecture absent | CLOSED LOCALLY | Linux container/server-worker/migration/rollback and host options documented; no host selected/deployed |
| R7 audit/CSP/lint | PARTIAL CLOSED LOCALLY | 0 critical/0 high/1 moderate; CSP/lint/build pass; moderate AJV needs Reviewer remediation decision |
| R8 browser matrix absent | PARTIAL | route/cart/checkout browser evidence at 619x616; requested controlled viewport/200% matrix not captured |
| R9 DNS/public records | DEFERRED AS REQUIRED | DNS plan documented; no records changed and no deployment selected |

Executor status remains `PARTIAL/BLOCKED`; only Reviewer can convert this matrix
to PASS/CLOSED.
