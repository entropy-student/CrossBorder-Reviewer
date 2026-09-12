# BATCH-07 执行提示词（外部部署与 Sandbox 纵向闭环）

Reviewer 已将 BATCH-06-R1 判定为 `RETURN`。请读取：

- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-06-R1\REVIEW_DECISION.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\tasks\BATCH-06.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商\AGENTS.md`

本轮只推进真实外部链路，不重新设计 UI、不重新选品。最终目标仍是“独立站正常使用并上线”。

## 当前已通过范围

- 当前 immutable Medusa image 已通过 registry mirror 构建；artifact cwd、non-root、migrate/server/worker、health/stop、镜像层扫描有证据。
- 隔离 PostgreSQL/Redis 上的迁移、Store API/cart、Webhook dedupe/concurrency/restart 有本地证据。
- Sandbox OAuth 和后台 Webhook 注册已验证，无需再次索取凭据。
- Live Secret 未读取，Live endpoint 未调用，Live 继续关闭。

## 必须完成

1. 选择一个支持持久 Medusa server + worker 的 Backend host；Vercel 仅作为 Storefront 方案，不可直接替代 Backend host。使用用户已批准的账号/项目和部署访问，不要创建未授权云资源。
2. 为 Sandbox 使用隔离 PostgreSQL/Redis，部署当前 immutable image 的 migrate/server/worker，并配置精确 HTTPS ingress。验证 DNS、TLS、POST receiver、raw body/PayPal headers、日志脱敏。
3. 将真实 signed Sandbox Webhook 送入 receiver，验证 Inbox claim、Medusa action、read-back、applied 状态和重放 no-op。确认 `markAppliedAfterMedusaReadback` 与 refund reconciliation 已由实际 worker/事件路径调用，而非只有测试直接调用。
4. 仅在上述链路通过后，使用已验证 Sandbox 配置创建一笔 `14.99 USD` AUTHORIZE 交易，完成 buyer approval、authorize、capture、partial refund、同 operation replay、真实 Webhook 和 PayPal read-back。遇到 CAPTCHA/登录停在 `SANDBOX_BUYER_ACTION_REQUIRED`，不得代填账号密码。
5. 真实验证完成后，再运行远程 Node 22.14/pnpm 10.11.1 CI、hosted browser matrix、备份恢复/回滚演练。Live 仍只做静态检查。

## 禁止事项

- 不读取、调用、验证、复制、保存或输出 Live Secret。
- 不创建第二笔收费，不写生产库存，不修改 DNS（除非用户已明确授权并且该记录属于本次批准部署），不发真实邮件，不提交/推送/创建 PR。
- 不 reset/drop 现有数据库或 Docker volume；不要把本地 deterministic seam、内部 HTTP 200 或静态契约写成 provider/hosted PASS。

## 交付

证据写入 `C:\Users\34707\Documents\ChatGPT\跨境电商-review\execution\BATCH-07\`，至少包括 `BATCH_REPORT.md`、`FINDING_MATRIX.md`、`COMPLETE_DIFF.patch`、`GIT_STATUS_HEAD.md`、`RUN_METADATA.json`、`A-host/`、`B-sandbox-receiver/`、`C-paypal-e2e/`、`D-ci-browser/`、`USER_ACTION_PACKET.md`。

最终状态只能是 `BATCH-07 READY_FOR_REVIEW` 或 `PARTIAL/BLOCKED`。如果没有 Backend host/部署访问，完成所有可执行检查并明确一个外部 blocker，不要声称部署或交易成功。
