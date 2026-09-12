# BATCH-04 PayPal 独立复审

复审范围：PayPal Provider、Storefront 客户支付数据流、PayPal return、Webhook inbox/重放、退款并发与状态收敛、Sandbox 证据。主项目只读；未使用任何 Live 凭据，未调用 PayPal Live、PayPal Sandbox 或 WorldFirst。

## 结论

```text
BATCH_04_PAYPAL=RETURN
LOCAL_PROVIDER_UNIT_CONTRACT=PASS
MEDUSA_SESSION_ID_INJECTION=STATIC_PASS
CUSTOMER_SANDBOX_VERTICAL_FLOW=RETURN
WEBHOOK_INBOX_AND_REPLAY=RETURN
REFUND_ASYNC_CONVERGENCE=RETURN
PRODUCTION_LIVE_READINESS=RETURN
LIVE_SECRET_ROTATION=USER_ACTION_REQUIRED
```

BATCH-04 的本地 Provider 基础比上一批完整：PayPal Orders v2 transport、严格 Sandbox approval URL、return 时的 cart/session/order 关联、Webhook 签名验证、关联订单回读、金额/币种/资源 ID 校验及请求幂等键均已出现。独立运行现有 PayPal 测试得到 `28 passed / 0 failed / exit 0`。

整项仍应 RETURN。客户支付只在 `paypal_sandbox_test` 暴露，Sandbox 垂直交易未执行；新增 inbox 只是未接线的数据模型；退款 PENDING 没有回读或事件收敛路径；生产 transport 被代码明确禁止。此外，本轮用户在对话中直接提供了 Live Secret。该 Secret 的值未被复审读取、复制或写入证据，但应视为已经暴露，必须在任何生产使用前撤销并重新生成。

## Findings

### P0 — 已在对话中暴露的 Live Secret 必须轮换

用户消息包含了 PayPal Live App Secret 明文。聊天记录不是生产 Secret Manager，当前 Secret 不应再用于任何部署或验证。

建议：立即在 PayPal Developer Dashboard 撤销/轮换该 Secret；新 Secret 只写入生产 Secret Manager，不能再次粘贴到聊天、仓库、Review 文档、构建日志或 `.env` 模板。Client ID 可公开，但 Secret 不可公开。

### P0 — 当前代码明确不能进行生产 PayPal 交易

- `apps/backend/medusa-config.ts:42-46` 在启用 provider 且环境为 production 时直接抛错。
- `apps/backend/src/modules/paypal/service.ts:785-787` 再次拒绝 production。
- `apps/backend/src/modules/paypal/transport.ts:71-82` 固定 API 根为 Sandbox，并拒绝非 Sandbox 环境。
- `apps/storefront/src/lib/checkout-exposure.ts:19-20,38-60` 只在 `paypal_sandbox_test` 模式开放 PayPal；默认 customer 模式继续关闭。

这些限制适合当前安全状态，但意味着“已有 Live App”不会使项目自动具备 Live 支付能力。生产 transport、生产 URL/Secret 注入、生产 Webhook、灰度开关和回滚仍需单独实现与复审。

### P0 — Sandbox 垂直交易尚未形成任何运行证据

`execution/BATCH-04/G-paypal-sandbox/SANDBOX_STATUS.md` 明确记录：本批没有创建 Sandbox order，没有 buyer approval、authorize、capture、refund、真实 Webhook 或 Medusa read-back。现有单元测试使用 mock transport，不能证明 PayPal 账号能力、return 行为、Webhook header 形态或 Medusa 数据库状态迁移。

建议：在隔离数据库和 Sandbox 专用部署完成一次同单闭环，并记录脱敏证据：创建 session/order → buyer approval → AUTHORIZE → Medusa order/read-back → CAPTURE → partial refund → Webhook 重复投递与乱序 → Provider/Medusa 最终一致。Live 继续禁用。

### P1 — `paypal_event_inbox` 只是模型，没有进入 Webhook 数据流

- `apps/backend/src/modules/paypal-reconciliation/models/paypal-event-inbox.ts:3-18` 只定义模型。
- `apps/backend/src/modules/paypal-reconciliation/service.ts:1-4` 只是空的 `MedusaService` 包装。
- 主项目中没有 Webhook handler、subscriber、workflow、job 或 reconciliation service 调用该 inbox。
- 该模块下没有 migration 文件；也没有数据库建表/read-back 证据。
- `apps/backend/src/modules/paypal/service.ts:1066-1077` 验签后直接把动作返回 Medusa Payment Module，完全绕过 inbox。

因此唯一 `provider_event_id` 约束没有实际去重作用，重启恢复、重复投递、乱序处理、失败重放、held 事件人工处理均不存在。

建议：生成并验证 migration；在真实 Webhook 入口接入 received/verified/applied/held/failed 状态机；以 provider event ID 建立原子去重；实现带次数、退避、下次执行时间和最后错误的重放任务；保存足以安全重算的规范化事件证据，并明确 PII 加密与保留期。

### P1 — 声明为 actionable 的事件多数仍被静默降为 `not_supported`

- `apps/backend/src/modules/paypal/service.ts:33-43` 把 capture pending/reversed/refunded、refund pending/failed 等 9 类支付事件列为 actionable。
- `apps/backend/src/modules/paypal/service.ts:626-636` 的实际 mapper 只处理 authorization created/voided 与 capture completed/declined（含 legacy denied）。
- `apps/backend/src/modules/paypal/service.ts:680-731` 即使完成 order 回读，最终仍调用上述 mapper。

结果是 `PAYMENT.CAPTURE.PENDING`、`PAYMENT.CAPTURE.REVERSED`、`PAYMENT.CAPTURE.REFUNDED`、`PAYMENT.REFUND.PENDING`、`PAYMENT.REFUND.FAILED` 会返回 `not_supported`，而 inbox 又未接入，无法形成 HOLD、告警或最终状态修正。

建议：让分类和实际处理矩阵一致。资金反转、退款失败、争议事件至少持久化为 HOLD/FAILED 并告警；可自动处理的事件必须以 resource/order/session/amount/currency 校验后更新 Medusa 状态。

### P1 — PENDING 退款会永久停留在 PENDING

- `apps/backend/src/modules/paypal/service.ts:928-932` 发现已有退款 operation 后直接复用本地状态；如果是 PENDING，不再调用 Provider。
- `PayPalTransport` 没有 retrieve-refund/read-back 方法。
- refund pending/failed Webhook 当前又会变成 `not_supported`。

所以某次退款返回 PENDING 后，重复操作只会继续返回 PENDING，没有任何路径确认其后来 COMPLETED 或 FAILED。Medusa 2.19 的 Payment Module 对同一 Payment 的退款金额检查具备数据库事务串行化，这能降低并发超额退款风险，但不能解决 Provider 成功、应用更新失败、异步退款变化或重启后的跨系统一致性。

建议：增加 `GET /v2/payments/refunds/{refund_id}` 回读，按 provider refund ID 对账；用 Medusa Refund 记录作为操作身份；对 Provider 已成功而本地写入失败的场景执行同一 idempotency key 回读恢复；并补充双请求、超时后成功、进程重启和乱序 Webhook 集成测试。

### P1 — Provider 可以在缺失 return/cancel/Webhook 配置时被启用

- `apps/backend/src/modules/paypal/service.ts:778-799` 的 `validateOptions` 只强制 Sandbox、AUTHORIZE 和 client credentials，没有强制 `webhook_id`、`return_url`、`cancel_url`。
- `apps/backend/src/modules/paypal/transport.ts:146-148` 任一 return/cancel URL 缺失时会完全省略 `application_context`。
- Webhook 到来时才会在 `apps/backend/src/modules/paypal/service.ts:1069-1072` 因缺少 Webhook ID 失败。

这允许部署出“支付方式可见、order 可创建、但客户无法可靠返回或 Webhook 永远失败”的半启用状态。

建议：Provider 启用时 fail closed：要求同环境 Webhook ID、HTTPS return URL、HTTPS cancel URL 全部存在；验证 URL 为明确允许的 Storefront origin，cancel URL 带明确取消语义；Sandbox/production 配置不能交叉。

### P2 — 客户链路具备代码骨架，但缺少 Store API 与浏览器级验证

正向证据：

- 安装的 Medusa 2.19 Payment Module 会先创建 session，再把真实 `paymentSession.id` 注入 `data.session_id` 后调用 Provider；因此 Storefront 只提交 `provider_id` 本身不是缺陷。
- `apps/storefront/src/modules/checkout/components/payment-button/index.tsx:178-210` 只接受 PayPal Sandbox 精确主机名的 HTTPS approval URL。
- `apps/storefront/src/app/api/payment-return/route.ts:33-68` 用服务器读取的 cart payment session 校验返回 token，再调用 cart complete；不会仅凭 URL 参数认定支付成功。
- `apps/backend/src/modules/paypal/service.ts:1066-1077` 在映射动作前要求 PayPal 官方签名验证成功。

剩余缺口：没有真实 Store API payment-session 集成测试、payment-return route 测试、浏览器 approval/cancel/retry 测试，也没有验证首次选择 PayPal 后 Server Component 是否及时得到新 session 与 approval URL。必须由隔离集成测试和 Sandbox 浏览器闭环确认。

## 独立验证

- `paypal-unit.log`：PayPal 定向单元测试 `28 passed / 0 failed / exit 0`。
- `STATIC_PROOF.txt`：模块引用、migration 数量、生产禁用、暴露开关及事件矩阵静态证据。
- 未调用任何 PayPal API；未创建订单；未修改主项目文件。

## Reviewer 建议顺序

1. 用户轮换已暴露的 Live Secret；新 Secret 只进入生产 Secret Manager。
2. 保持 production 和 customer exposure 关闭，先修复 inbox/migration/replay、事件矩阵和 refund read-back。
3. 增加 Provider 启用配置的 fail-closed 校验。
4. 在隔离 PostgreSQL 运行 Store API、Webhook 重复/乱序、退款并发/重启集成测试。
5. 使用 Sandbox buyer 完成唯一一次全链路交易并由 Reviewer 验收。
6. 单独实现和复审 production transport、生产 Webhook、Secret Manager、监控/告警与灰度开关；然后才允许 Live 小额验收。

不应修改：冻结的 Medusa/Figma/Web UI 视觉方案、商品、价格、选品结论；也不应因为已有 Live App 就跳过 Sandbox 闭环或提前开启客户支付。
