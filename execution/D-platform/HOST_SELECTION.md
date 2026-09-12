# Host selection status

`BACKEND_HOST_SELECTION=BLOCKED_EXTERNAL_PREREQUISITE`

Selecting a host without an approved account/project and deployment credentials would create external state outside the authorized workspace. Once supplied, the host must support a persistent Medusa server, separate worker, isolated PostgreSQL/Redis, public HTTPS ingress, and a receiver endpoint suitable for Sandbox Webhook delivery. Live must remain closed.
