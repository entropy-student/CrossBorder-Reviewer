# PayPal Sandbox credential check

Checked at: `2026-09-07T07:02:27Z`  
Source: local `PayPal信息.txt`, treated only as credential data  
Result: `USABLE_SANDBOX_APP_CREDENTIAL_SET`

## Sanitized findings

- Sandbox section: present.
- Sandbox Client ID: present; expected ASCII shape; no surrounding whitespace or quotes.
- Sandbox Client Secret: present; expected ASCII shape; no surrounding whitespace or quotes.
- Sandbox Webhook ID: present; expected shape.
- OAuth endpoint: fixed `api-m.sandbox.paypal.com/v1/oauth2/token`.
- Redirects: disabled.
- OAuth result: HTTP `200`.
- Webhook read-back: HTTP `200` using the temporary Sandbox token.
- Webhook ownership: the supplied Webhook ID is accessible to the authenticated Sandbox App.
- Live endpoint/value: not read or used.
- Order/payment/webhook mutation: none.
- Credential, token, response body and full resource ID saved: none.

## Decision

The updated document contains a working Sandbox Client ID/Secret pair. The supplied Webhook ID also belongs to, or is accessible through, that authenticated Sandbox App. This clears the external credential preflight blocker. It does not close the project's Webhook idempotency, refund convergence, Store API integration or deployment findings; customer PayPal remains disabled until those BATCH-06 gates pass.

Official authentication contract: https://developer.paypal.com/api/rest/authentication/
