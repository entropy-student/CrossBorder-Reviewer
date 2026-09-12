# 当前唯一执行任务

请执行下一轮外部链路任务：[BATCH-07 外部部署与 Sandbox 纵向闭环](tasks/BATCH-07_EXECUTOR_PROMPT_2026-09-08.md)。R1 本地镜像和隔离集成已完成，但 Reviewer 判定 `BATCH-06-R1=RETURN`；背景和证据见 [BATCH-06-R1 独立复审决定](reviewer/BATCH-06-R1/REVIEW_DECISION.md)。

Reviewer 判定：[BATCH-05 独立复审](reviewer/BATCH-05/REVIEW_DECISION.md) 为 `RETURN`。专项证据：

- [PayPal](reviewer/BATCH-05/agent-paypal/REVIEW.md)
- [Inventory / Store API](reviewer/BATCH-05/agent-inventory/REVIEW.md)
- [CI / Deployment](reviewer/BATCH-05/agent-ci-deploy/REVIEW.md)

执行原则：R1 已完成本地镜像、artifact、隔离 PostgreSQL/Redis、Store API 和数据库重放补证，但 Reviewer 判定 `BATCH-06-R1=RETURN`。本轮先选择持久 Backend host，再部署隔离 Sandbox receiver，完成 DNS/TLS/真实签名 Webhook 和唯一 Sandbox transaction 的 authorize/capture/refund/read-back；不要把 Vercel Storefront 当作 Backend host。Sandbox OAuth 与后台 Webhook 注册已验证，无需再次索取凭据。Live receiver 继续关闭。禁止 Live API、真实收费、生产商品库存写、未经复审的生产推广、提交和推送。完成后一次性提交 `READY_FOR_REVIEW` 或 `PARTIAL/BLOCKED`。
