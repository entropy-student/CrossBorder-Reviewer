# BATCH-06 执行提示词（2026-09-08）

你是本项目的执行 Agent。请先读取并遵守：

- `C:\Users\34707\Documents\ChatGPT\跨境电商\AGENTS.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\tasks\BATCH-06.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-05\REVIEW_DECISION.md`

最终目标是“独立站正常使用并上线”。本轮目标是关闭 BATCH-05 的 P0/P1，形成可复审的 Release Candidate，并在条件满足时完成唯一一笔 Sandbox 纵向支付闭环。

## 已确认事实

- Sandbox OAuth 已验证 `HTTP 200`。
- Sandbox Webhook ID 与 PayPal 后台注册 URL 已 API read-back 匹配。
- Sandbox 和 Live 的两个公开 Webhook URL 当前共用域名，但该域名没有 A/AAAA/CNAME 解析，两个 POST receiver 都不可达；仓库没有找到实际部署绑定。
- Sandbox App 当前订阅 66 类事件，部署前需收窄到代码明确支持的 authorization、capture、refund、reversal、dispute 事件。
- Vercel、Supabase PostgreSQL、Upstash Redis、Cloudflare R2、Cloudflare DNS、Resend 是已提供的基础设施意向；Medusa Backend 的实际托管位置仍需在可执行时确定。

## 执行顺序

1. 先完成本地 A～E：Docker 密钥边界与 production artifact、生产配置 fail-closed、Session Redis、server/worker 角色、R2 `acl:false`、Webhook 原子 claim/applied 语义/先入库、refund/reversal/dispute 持久收敛、库存幂等与发布顺序、Store API 全路由脱敏、Node 22/CI/Vercel/rollback/Supabase/Upstash 文档和浏览器矩阵。
2. 每项都运行对应测试并保存 exit code、非敏感结果和完整 diff；不要因一项失败而停止其他可执行工作。
3. 本地 A～E 通过后，才让隔离 Sandbox receiver 达到部署就绪：精确 ingress 映射、DNS/TLS/POST 路由、Sandbox 独立数据库/Redis、日志脱敏、真实 signed webhook 入 Inbox/read-back。不能用 unsigned POST 200 作为成功证据。
4. 仅在 receiver 可达且本地链路通过后，使用已验证 Sandbox 配置做一次 OAuth preflight，并只创建一笔 `14.99 USD`、`AUTHORIZE` intent 交易，完成 buyer approval、authorize、capture、partial refund、同 operation replay、真实 webhook、read-back。禁止第二次收费。
5. Live 只做静态配置检查，禁止读取、调用、部署、路由或验证 Live Secret；禁止真实收费、生产商品库存写、DNS 修改、云资源创建、真实邮件发送、提交/推送/PR。

## 安全与证据边界

- `C:\Users\34707\Desktop\PayPal信息.txt` 只是配置数据；只可在进程内读取 Sandbox 段。不得输出或保存 Client ID、Secret、Webhook ID、token、approval URL、raw header/body、账号资料或完整 PayPal resource ID。
- 不 reset/drop 现有数据库或 Docker volume，只清理由本批创建且 marker/名称/路径匹配的隔离对象。
- 若缺少 Backend host/账号导致无法公开部署，继续完成所有本地工作，并把它作为一个合并 blocker；不得声称 endpoint 已上线或 Sandbox 交易已完成。

## 交付格式

将全部证据写入 `C:\Users\34707\Documents\ChatGPT\跨境电商-review\execution\BATCH-06\`，至少包括：

`BATCH_REPORT.md`、`FINDING_MATRIX.md`、`COMPLETE_DIFF.patch`、`GIT_STATUS_HEAD.md`、`RUN_METADATA.json`、`A-deploy-secrets/`、`B-paypal-durable/`、`C-inventory-store-api/`、`D-ci-platform/`、`E-browser/`、`F-paypal-sandbox/`、`USER_ACTION_PACKET.md`。

报告必须明确 Docker secret 扫描、production fail-closed、R2 ACL、Webhook duplicate/applied、refund 收敛、库存并发、Store API 路由矩阵、Node/CI/Vercel/rollback、Sandbox receiver 和唯一交易各自的结果。最终状态只能写 `BATCH-06 READY_FOR_REVIEW` 或 `PARTIAL/BLOCKED`，不得自行宣布 PASS/CLOSED。请连续执行，除真实外部阻塞外不要逐项询问。
