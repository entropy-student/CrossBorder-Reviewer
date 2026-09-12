# BATCH-04 PayPal Sandbox Status

This file deliberately records status only. No credential, token, email,
password, approval URL, raw request/response body, or complete provider ID is
stored here.

| Check | Status | Evidence / limitation |
|---|---|---|
| OAuth capability | `USER_REPORTED_VERIFIED` | Existing local OAuth verification was accepted from the prior batch; no credentials were re-requested. |
| Sandbox API called by this batch | `NO` | No provider transport call was made. |
| Sandbox order created | `NO` | No external transaction was created. |
| Buyer approved | `NOT_RUN` | Requires an external sandbox browser action. |
| PayPal authorize | `NOT_RUN` | Requires one approved sandbox order. |
| PayPal capture | `NOT_RUN` | Must use the authorization ID; no capture was attempted. |
| PayPal refund | `NOT_RUN` | Must use the same sandbox capture; no refund was attempted. |
| Real PayPal webhook received | `NO` | No webhook endpoint was exercised. |
| Medusa isolated order | `NOT_RUN` | No isolated order fixture was created in this batch. |
| Live PayPal / WorldFirst | `NO` | No live endpoint or settlement API was called. |
| Real money charged | `NO` | Confirmed by scope and execution logs. |

The provider/service, return path, Payments v2 correlation, event policy,
fail-closed gates, and persistent inbox model have local contract/build
evidence in the sibling BATCH-04 evidence folders. They are not sandbox
evidence and must not be presented as such.

`SANDBOX_STATUS=EXTERNAL_ACTION_REQUIRED`
