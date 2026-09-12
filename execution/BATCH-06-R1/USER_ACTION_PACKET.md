# User Action Packet

One external prerequisite packet is required before the blocked provider/hosted checks can continue:

1. Provide an approved Backend host and project, deployment access, and a public HTTPS receiver URL whose DNS/TLS ownership is authorized for this batch.
2. Provide Sandbox-only merchant application credentials and the Sandbox webhook configuration/ID through the approved secret channel. Do not provide or authorize Live credentials.
3. Confirm the isolated Sandbox PostgreSQL/Redis ownership and the receiver route. The receiver must preserve the raw body and required PayPal headers for server-side signature verification, then persist Inbox evidence and perform Medusa read-back.

After those conditions are verified, the executor may perform exactly one Sandbox `14.99 USD` `AUTHORIZE`, then capture, refund, and read back each state. No second attempt, real charge, Live endpoint, Live secret, DNS change, or production inventory write is authorized by this packet.
