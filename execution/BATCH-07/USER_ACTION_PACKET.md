# User Action Packet

本轮只需要补一个合并前置条件：指定一个已批准、支持持久 Medusa server + worker 的 Backend host，并提供该项目的部署访问。

host 必须支持：

- 持久 server 与 worker 两个进程；
- 独立 migration job；
- Sandbox 专用 PostgreSQL/Redis；
- 精确 HTTPS ingress、DNS/TLS 和日志访问；
- rollback/redeploy。

Vercel 仅可用于 Storefront，不能替代 Backend host。无需再次提供 Sandbox OAuth 或后台 Webhook 注册凭据；Live Secret 仍不要提供，Live 仍保持关闭。
