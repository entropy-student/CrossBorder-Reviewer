# BATCH-02 External prerequisites and limits

These are deliberately not guessed or bypassed by the executor.

1. A clean external CI checkout is still needed to prove the workflow in an
   environment without the local parent document center, `.env`, `.runtime`,
   Docker data and local caches. The local complete gate is recorded, but it is
   not remote CI evidence.
2. PayPal sandbox OAuth requires an actual Developer Dashboard sandbox REST
   application Client ID and Client Secret, plus a Webhook ID after webhook
   configuration. The supplied local file was not an unambiguous application
   credential tuple, so no OAuth call was attempted.
3. PayPal sandbox merchant/buyer eligibility and callback/return setup remain
   unverified. OAuth alone would not prove authorization, capture, refund or
   webhook recovery.
4. Before any customer exposure, sandbox must prove the full AUTHORIZE flow,
   amount/currency identity, idempotent retry, refund pending/completed/failed
   handling, and event reconciliation. WorldFirst remains a separate
   Collection Account settlement path; no WorldFirst API was called.
5. No production shipping, tax, inventory ownership, payment credentials or
   customer-facing PayPal enablement was inferred from local tests.

`NEXT_STEP=INDEPENDENT_REVIEW_OF_BATCH_02`
