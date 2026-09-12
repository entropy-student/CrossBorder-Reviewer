# Single User Action Packet

`USER_ACTION_REQUIRED=CONFIRM_CURRENT_PAYPAL_SANDBOX_APP_SETUP`

The current local sandbox OAuth preflight returned HTTP `401`, so BATCH-05
stops before buyer approval and the single authorized sandbox transaction. The
user should, outside chat, confirm that the local sandbox App ID/Secret and
Webhook ID belong to the same active PayPal Sandbox app and place only those
non-live values in the ignored local runtime configuration. Do not provide or
reuse the exposed Live Secret. After that confirmation, Reviewer may authorize
one sandbox vertical run.

The backend-host choice is separately documented as a deferred deployment
decision; it is not an authorization to deploy in this batch.
