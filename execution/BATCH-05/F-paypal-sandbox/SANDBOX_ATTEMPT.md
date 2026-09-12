# BATCH-05 PayPal Sandbox Evidence

`REAL_PAYPAL_API_CALLED=YES` only for the fixed sandbox OAuth endpoint.
No Orders, Payments, webhook, refund or WorldFirst endpoint was called.

| Check | Result |
|---|---|
| External environment | PayPal Sandbox only |
| OAuth endpoint | Called once with local sandbox values read in-process |
| Sanitized HTTP result | `401` |
| Token retained | `NO` |
| Sandbox order created | `NO` |
| Buyer approval | `NOT_ATTEMPTED` |
| Authorization/capture/refund | `NOT_ATTEMPTED` |
| Webhook delivery | `NOT_ATTEMPTED` |
| Real money | `NO` |
| Live PayPal secret | `NOT_READ / NOT_USED / NOT_SAVED` |
| WorldFirst API | `NOT_CALLED` |

The process output intentionally contains no credential, token, email, password,
approval URL, full resource ID, raw body or header. No retry was made after the
401. The sandbox vertical therefore remains blocked before buyer approval.
