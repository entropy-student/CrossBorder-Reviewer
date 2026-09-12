# BATCH-03 PayPal Local Contract Evidence

## Result

`RUNTIME_IMPLEMENTATION_CONTRACT=MEDUSA_PAYMENT_MODULE_ABSTRACT_PAYMENT_PROVIDER`

`PAYPAL_PAYMENT_INTENT=AUTHORIZE`

`PAYPAL_AUTO_CAPTURE=false`

`PAYPAL_PROVIDER_ENABLED=NO`

`PAYPAL_CUSTOMER_EXPOSURE=DISABLED`

## Evidence covered

- transport JSON requests use `Content-Type: application/json`; OAuth uses the
  form content type;
- retry classification is limited to timeout/408, 429 and 5xx, with bounded
  retry/backoff and no response-body logging;
- status reconciliation keeps authorization/capture resource evidence and does
  not infer captured state from Order `COMPLETED` alone;
- capture requires the stored authorization ID;
- webhook mapping is fail-closed on event/resource/correlation/amount data and
  uses Payments v2 `PAYMENT.CAPTURE.DECLINED`; order-approved is unsupported;
- refund operations preserve operation-level keys and pending state locally;
  durable concurrency and provider completion remain sandbox-required;
- customer mode continues to hide technical System Payment and technical
  shipping options.

The supporting raw logs are in this folder's parent BATCH-03 evidence tree.
These are `MOCK` or `LOCAL_CONTRACT_PASS` results, not external payment PASS.
