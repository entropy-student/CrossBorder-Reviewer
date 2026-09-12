# BATCH-06-R1 执行提示词（2026-09-08）

Reviewer 已将 BATCH-06 判定为 `RETURN`。请读取：

- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-06\REVIEW_DECISION.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\tasks\BATCH-06.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商\AGENTS.md`

最终目标仍是“独立站正常使用并上线”。请连续执行，不逐项询问。

## 必须先完成的 P0

1. 在能访问 Docker Hub 或受控 registry mirror 的干净 Linux CI/构建机重建当前 `deploy/medusa/Dockerfile`。保存基础镜像 digest、build exit code、镜像层 secret 扫描和最终文件清单。
2. 用同一 immutable image 分别运行 `MEDUSA_RUNTIME_ROLE=migrate|server|worker`，验证 non-root、health/readiness、worker Admin disabled、graceful shutdown 和日志脱敏。
   同时确认 entrypoint 的工作目录与 production artifact 一致：当前 artifact 的 `medusa-config.js`/`package.json` 位于 `/app/apps/backend/.medusa/server`，不能只在 `/app` 直接调用 CLI 后假设启动成功。
3. 选择实际 Backend host，部署独立 Sandbox receiver；配置独立 Sandbox PostgreSQL/Redis、精确 DNS/TLS/ingress。验证真实 signed Webhook → Inbox → Medusa read-back。
4. receiver 和本地支付链路通过后，才执行唯一一笔 14.99 USD AUTHORIZE Sandbox 交易、authorize/capture/partial refund、同 operation replay 和 read-back。Live 继续关闭。

## 必须补的 P1

- 真实隔离数据库上的 Webhook duplicate/并发/中断重启，以及 refund partial/replay/convergence。
- 真实 Medusa inventory create/rerun/update/concurrency 和 Store API HTTP route matrix。
- 真实 R2 fixture，证明请求不发送 `x-amz-acl`。
- 证明 `MEDUSA_LOCAL_RUNTIME` 不能在托管生产环境绕过 production validation；必要时限制或移除该入口。
- 用 Node 22.14、pnpm 10.11.1 clean frozen install 和远程 CI 重跑关键验证。

## 禁止事项

- 不读取、调用、验证、复制、保存或输出 Live Secret。
- 不创建第二笔收费、不创建订单、不写生产库存、不改 DNS、不创建云资源、不发真实邮件、不提交/推送/创建 PR。
- PayPal信息.txt 只作为 Sandbox 配置数据，凭据只在进程内使用；证据不得保存 token、approval URL、raw body/header、账号资料或完整 resource ID。
- 不 reset/drop 现有数据库或 Docker volume。

## 交付

证据写入 `C:\Users\34707\Documents\ChatGPT\跨境电商-review\execution\BATCH-06-R1\`，至少包括 `BATCH_REPORT.md`、`FINDING_MATRIX.md`、`COMPLETE_DIFF.patch`、`GIT_STATUS_HEAD.md`、`RUN_METADATA.json`、`A-docker/`、`B-paypal/`、`C-integration/`、`D-platform/`、`USER_ACTION_PACKET.md`。

最终状态只能是 `BATCH-06-R1 READY_FOR_REVIEW` 或 `PARTIAL/BLOCKED`，不得自行宣布 PASS/CLOSED。若 registry 或 Backend host 仍不可用，完成所有本地可执行项并明确列出单一外部 blocker，不要声称部署或交易成功。
