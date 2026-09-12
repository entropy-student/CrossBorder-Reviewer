# User action packet

One combined external blocker remains before the conditional Sandbox vertical:

1. Select/provide the Medusa Backend hosting target and isolated Sandbox
   PostgreSQL/Redis resources.
2. Deploy the Sandbox-only receiver with the exact registered POST URL, DNS,
   TLS, rate limiting, redacted logging, and a Sandbox-only database/queue.
3. Provide no new PayPal credential in this packet; the previously verified
   Sandbox OAuth configuration remains local-only and must not be copied into
   logs or evidence.

Until these are complete, the next executor may continue local verification
but must not claim signed webhook or payment completion.
