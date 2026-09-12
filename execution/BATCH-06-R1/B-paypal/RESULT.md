# B — PayPal evidence

- Backend unit suite: 3 suites, 37 tests, exit code `0`; see `../C-integration/backend-unit-current.log`.
- Local payment boundary contracts pass and explicitly report no real payment call; see `../C-integration/test-contracts-current.log`.
- Local unit coverage exercises AUTHORIZE-only behavior, capture/refund idempotency, refund replay/read-back seams, webhook signature rejection, webhook inbox claim/replay semantics, and safe-data filtering.
- This is not provider evidence. No approved public Backend host, DNS/TLS ingress, deployed receiver, Sandbox webhook verification, provider read-back, or Sandbox payment transaction was available in this execution environment.
- No Sandbox authorization/capture/refund transaction was attempted. Live remains disabled; no Live secret or Live endpoint was read or called.
