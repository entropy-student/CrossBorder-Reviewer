# PayPal Webhook registration and endpoint deployment check

Checked: 2026-09-08（Asia/Shanghai）  
Source file: local `PayPal信息.txt`, treated only as configuration data  
Overall result: `PAYPAL_REGISTRATION=PARTIAL_PASS`, `PUBLIC_ENDPOINTS=NOT_DEPLOYED`

## Sanitized results

| Gate | Result |
|---|---|
| Sandbox Client ID / Secret shape | PASS |
| Fixed Sandbox OAuth | PASS, HTTP 200 |
| Sandbox Webhook ID read-back | PASS, HTTP 200 |
| Sandbox read-back ID equals local ID | PASS |
| Sandbox read-back URL equals document URL | PASS |
| Sandbox subscribed event types | 66; RETURN, too broad for implemented scope |
| Sandbox Webhook URL present and HTTPS | PASS |
| Live Webhook URL present and HTTPS | PASS |
| Sandbox and Live URLs distinct | PASS |
| Shared URL hostname DNS A/AAAA/CNAME | FAIL / absent |
| Sandbox URL TLS/HTTP reachability | FAIL / name resolution |
| Live URL TLS/HTTP reachability | FAIL / name resolution |
| Repository deployment binding/config | NOT FOUND |
| Vercel/Wrangler/Railway/Fly local project binding | NOT FOUND |
| Live App/Webhook API verification | NOT RUN; exposed Live secret remains prohibited |

No credential, token, response body, complete Webhook ID, random URL path,
buyer/seller account, email or password was printed or saved. No order,
payment, Webhook mutation, Live API call or DNS change was made.

## Interpretation

The PayPal Sandbox app is now usable and its Webhook registration is real.
Registration only tells PayPal where it should send events; it does not deploy
the receiver. Both configured receiver URLs currently use the same unresolved
hostname, so neither Sandbox nor Live POST endpoint is publicly reachable.

The two random public paths also do not directly match Medusa 2.19's built-in
`POST /hooks/payment/:provider` route. A deployed ingress must map each public
path to the correct environment-specific Medusa instance without exposing the
internal route broadly. No such ingress/rewrite/Worker configuration exists in
the reviewed repository.

The installed Medusa hook route queues the event and returns HTTP 200 before
provider verification runs asynchronously. Endpoint acceptance therefore must
be tested with a real signed Sandbox event and durable Inbox read-back; a simple
unsigned POST returning 200 would not prove verification or application.

## Reviewer decision

1. Keep Live endpoint disabled. The current provider deliberately rejects
   production mode, and BATCH-05 still has payment replay/refund and deployment
   P0 findings.
2. After BATCH-06 local P0 fixes, deploy only a dedicated Sandbox Backend
   server+worker+PostgreSQL+Redis environment and bind the already registered
   Sandbox URL to it.
3. Prove DNS, TLS, route mapping, real PayPal signature verification, exactly
   one Inbox record, restart recovery and safe failure handling.
4. Reduce Sandbox subscription from all 66 event types to the reviewed payment,
   refund, reversal and dispute set. Do this only when the receiver handles the
   exact selected events.
5. Create/enable the Live receiver only after Sandbox vertical PASS, Backend
   hosting selection, production secret rotation, deployment review and explicit
   production promotion approval.

Official PayPal references:

- https://developer.paypal.com/api/rest/authentication/
- https://developer.paypal.com/api/rest/webhooks/rest/
