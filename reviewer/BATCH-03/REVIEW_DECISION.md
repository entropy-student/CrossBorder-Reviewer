# BATCH-03 独立复审：PARTIAL PASS / RETURN

日期：2026-09-06  
最终目标：独立站正常使用并上线。  
Reviewer 结论：BATCH-03 的本地安全、类型、单元与多数契约修复可以分项关闭；整批不能 PASS，不能进入客户支付或生产上线。

## 总体评价

项目继续沿用 Medusa 2.19 + Next.js 15 + PostgreSQL 的方向是合理的，不需要重做架构或视觉。BATCH-03 明显提升了本地运行安全、PayPal HTTP 基础语义、商品/组件校验、客户模式隔离和错误显示。然而当前成果仍是“安全关闭的本地应用”，不是“可收款、可履约、可上线的独立站”。

本轮最关键的差距不是测试数量，而是测试与真实链路之间仍有断点：GitHub Actions 的构建步骤没有可用 backend；PayPal 官方 Payments v2 webhook 形状会被当前 mapper 拒绝；客户 PayPal 按钮/redirect/return 尚未实现；所谓生产库存只打开 manage_inventory，没有写 inventory level；Store API 只过滤 product endpoints，cart/order 嵌套 metadata 仍无后端投影。

## 独立执行与证据

- `corepack pnpm run typecheck`：PASS，退出码 0。
- `corepack pnpm run test`：PASS，27/27 backend tests 及 payment/product/component contracts 全部执行。
- PayPal 官方 webhook 形状探针：FAIL AS EXPECTED。以 PayPal 官方 `PAYMENT.CAPTURE.COMPLETED` 示例字段调用项目真实 `mapPayPalWebhookAction`，函数因缺少顶层 `resource.custom_id/invoice_id` 拒绝；官方示例通过 `supplementary_data.related_ids.order_id` 关联订单。
- 生产库存 payload 探针：FAIL AS EXPECTED。builder 接受 location 和数量并输出 `manage_inventory=true`，但最终 payload 没有 location、inventory quantity 或 inventory level 操作。
- 嵌套公开数据探针：FAIL AS EXPECTED。cart item 的 product/variant 私有 metadata 原样保留。
- production dependency audit：4 high、7 moderate、0 critical；属于当前锁文件，不自动等于均可远程利用，但上线前必须按实际路径处置。
- Impeccable 代码级 UI detector：只报告既有 Plus Jakarta Sans 为通用字体。该字体属于已冻结视觉，不据此要求重做设计。

复审证据均在本目录：`typecheck-corepack.log`、`unit-contracts-corepack.log`、`paypal-official-webhook-probe.log`、`product-inventory-probe.log`、`nested-catalog-probe.log`、`pnpm-audit-prod.json`。首次并行调用宿主 pnpm 11 因 modules 版本与无 TTY 中止；没有删除依赖，随后按 packageManager 指定的 Corepack pnpm 10.11.1 顺序复跑并通过。

## 分项验收

| 工作包 | Reviewer 结论 | 说明 |
|---|---|---|
| RT-01 staging 删除边界 | PASS_LOCAL | 37 PASS / 0 FAIL / 1 symbolic-link SKIP；junction/reparse、ownership marker、严格子目录成立 |
| RT-02 进程身份 | PASS_LOCAL | 9/9，旧 PID、身份读取失败、错误项目均拒绝 |
| RT-03 服务身份 | PASS_LOCAL | 7/7，HTTP 200 不再单独作为复用依据 |
| RT-04 本地统一入口 | PASS_LOCAL | typecheck、真实 unit/contracts、failure injection 可执行 |
| GitHub Actions / 干净远端构建 | RETURN | workflow 把 backend 指向 127.0.0.1:9999，却没有启动 backend；现有日志已证明 backend 不可达时 storefront build 失败 |
| Product / Component validator | PASS_LOCAL | 公开 mapper 统一、非法资产/状态/价格/库存形状、第二变体、hard fail/证据状态已覆盖 |
| 正式库存落库与并发 | RETURN | 仅设置 manage_inventory；未创建/更新 location inventory level，零库存/最后一件并发未验证 |
| Storefront 局部修复 | PARTIAL_PASS | 邮箱真正只读、加购 finally、cart 404、订单/payment no-store、付款证据文案等可保留 |
| 支付失败恢复 | RETURN | payment-return 写入的 `payment_failed/order_failed/payment_retry` 无消费者；PayPal redirect/return/cancel 未实现 |
| Store API 私有 metadata | RETURN | 只覆盖 `/store/products` 与 `/store/products/:id`；cart/order 嵌套 product/variant 未覆盖 |
| PayPal transport 基础 | PASS_LOCAL_PARTIAL | JSON header、4xx/重试分类、资源状态、ID/金额校验较 BATCH-02 已修复 |
| PayPal Medusa 真实集成 | RETURN | provider 客户入口固定 false，前端无 PayPal 分支；尚无真实 payment-session → approval → authorize/capture 链路 |
| PayPal webhook/退款恢复 | RETURN | 官方 Payments v2 事件关联失败；无项目级持久 event inbox/reconciliation；pending/refund/reversal/dispute 与重启恢复未完成 |
| PayPal Sandbox | RETURN / SANDBOX_PARTIAL | OAuth 已有可信证据；没有 create/approval/authorize/capture/refund/webhook/Medusa read-back |
| 履约准备文档 | PASS_AS_BLOCKER_RECORD | 文档诚实记录 UNKNOWN/HOLD；不构成履约可用 |
| 生产上线 | BLOCKED | 域名、托管、邮件、政策、税务、库存/物流、备份恢复、监控和 live PayPal 均未验收 |

## 必须返回的主要问题

### R1 / P0（开放 PayPal 前）：客户支付链路尚不可执行

`apps/storefront/src/lib/checkout-exposure.ts:33` 将 PayPal 固定关闭；payment selection 只对 Stripe 初始化 session，PaymentButton 也没有 PayPal redirect/return 分支。直接打开 provider flag 不会产生一个可用客户流程。必须从真实 Store API 创建 payment session，校验 session 与 PayPal order，安全跳转 approval URL，处理取消/重复返回，再由 Medusa 后端授权；URL 参数不能宣布资金成功。

### R2 / P0（依赖 webhook/发货前）：官方 Payments v2 webhook 会被拒绝

`apps/backend/src/modules/paypal/service.ts:554-559` 只从 payment resource 顶层读取 `custom_id/invoice_id`。PayPal 官方 capture webhook 示例在 resource 中提供 `supplementary_data.related_ids.order_id`，不直接提供本地 session ID。真实函数探针因此抛出“missing ... payment-session correlation ID”。

修复应先用 related order ID 查询/核验 PayPal Order，再从 purchase unit 的 custom_id 取得 Medusa session ID，并同时核对 resource ID、金额、币种和环境。随后才返回 Medusa action。还需要项目级持久事件去重、乱序、失败与重启恢复，不能只扩展 mapper 字符串。

官方依据：[PayPal Webhook 集成示例](https://developer.paypal.com/api/rest/webhooks/rest/)、[Payments v2 supplementary_data](https://developer.paypal.com/api/payments/v2/definitions/supplementary_data/)、[PayPal 事件清单](https://developer.paypal.com/api/rest/webhooks/event-names/)。

### R3 / P0（正式库存前）：生产库存模式没有写库存

`05_product/scripts/medusa-product-payload.mjs:51-55` 校验 location/quantity，`:79` 只输出 `manage_inventory=true`；writer 只 POST product 并读回该布尔值。独立探针确认 location 和 quantity 都未出现在 payload，也没有 inventory-level write。

Medusa 将 variant、inventory item、location inventory level 分开；打开 `manage_inventory` 不会创建带数量的库存 level。正式写入必须在同一受控流程中解析 variant inventory item，upsert 指定 stock location 的 stocked quantity，并从 Admin/Store availability 读回。参考：[Medusa Variant Inventory](https://docs.medusajs.com/resources/commerce-modules/product/variant-inventory)、[Medusa Module Relations](https://docs.medusajs.com/resources/commerce-modules/product/relations-to-other-modules)。

### R4 / P1：CI 声明存在，但 workflow 的 build 依赖不存在的服务

`.github/workflows/verify.yml` 将 storefront backend URL 设为 `127.0.0.1:9999`，未启动 backend/DB。BATCH-03 自己的首次 build 在 backend 19600 不可达时已 ECONNREFUSED；仅在手动启动现有本地 backend 后通过。当前 workflow 推送后预计在 `verify:build` 失败。需要让 build 真正无后端可重复，或在 CI 启动隔离 backend 及数据库；不能把用户现有运行实例当 CI 前提。

### R5 / P1：Store API allowlist 不是完整后端数据边界

`apps/backend/src/api/middlewares.ts:133-144` 只投影两个 product route。cart/order API 会返回嵌套 line item、product、variant；当前投影函数对这种响应不处理。独立探针确认 supplier/cost/supplier SKU 示例字段仍存在。应在所有客户可达序列化路径做服务端 allowlist，并测试 products、cart、order、line item 四种形状。

另有键名漂移：writer 输出 `pawfectly_availability_mode` / `pawfectly_selling_price_status`，allowlist 使用无前缀名称；现有单测使用了与真实 writer 不同的 fixture key。

### R6 / P1：退款与事件仍把 payment.data 当并发事实源

`refund_operations/refunded_amount` 只能描述一次调用返回的新 data，无法证明两个并发操作、进程重启或“远端成功、本地超时”后的唯一最终账。BATCH-03 已诚实承认 durable concurrency 未完成。应以 Medusa 原生 Payment/Capture/Refund 记录加 provider resource read-back 为事实源；无法自动判定时进入 HOLD 和人工对账，不能在 provider data 中维护第二套不带锁的总账。

### R7 / P1：客户恢复和基础上线防护仍不完整

- `/api/payment-return` 生成的 cart error 参数没有页面读取者，失败用户只看到普通 cart。
- checkout 的通用 ErrorMessage 没有 `role=alert` 或 live region，异步支付/运费错误对读屏不可靠。
- checkout 多处固定 `w-1/3` 没有窄屏变体。
- `next.config.js` 仍 `images.unoptimized=true`，没有生产安全响应头。
- dependency audit 仍为 4 high / 7 moderate；需升级、override 或以不可达性证据逐项处置。
- lint 仍有 hook dependency 警告；至少 shipping 与 product-actions 的状态/路由同步需要行为测试后修复。

## 代码级 UI Audit

Implementation Integrity：PASS。现有 `ph-*` 体系、token 类、产品内容与当前品牌一致；detector 唯一“通用字体”提示不构成上线阻塞，因为用户已冻结视觉。

| 维度 | 分数 | 关键发现 |
|---|---:|---|
| Accessibility | 2/4 | 异步错误缺 live announcement；部分 label/按钮关联与触控范围需补 |
| Performance | 2/4 | 全局图片禁用优化；列表先取最多 100 条再客户端筛选 |
| Responsive | 2/4 | checkout summary 固定三分之一宽度 |
| Theming | 3/4 | 多数使用 UI token，少量硬编码 rose 色 |
| Implementation Integrity | 3/4 | 品牌一致；真实 writer/allowlist 键名与 route 覆盖不一致 |
| **总分** | **12/20** | **Acceptable，需要上线前加固** |

UI 相关计数：P0 0、P1 2、P2 4、P3 0。优先执行 `/impeccable harden`（支付错误恢复与可访问状态）、`/impeccable adapt`（checkout 窄屏）、`/impeccable optimize`（图片/请求），最后 `/impeccable polish`。不重新设计页面、字体、Figma 或组件体系。

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/impeccable audit` after fixes to see your score improve.

## 建议执行顺序

1. 先修 CI 可重复性、PayPal Medusa session/return、官方 webhook 关联、后端 metadata 全路径边界和真实 inventory level；全部进入统一 verify。
2. 用隔离数据库执行 product inventory、Store API、客户 checkout 与退款/事件重启集成测试。
3. 使用现有本机 PayPal sandbox 资料完成一笔沙箱 order 的 approval→authorize→capture→partial refund→read-back；同一交易覆盖重放，不再次向用户索要 App Client ID/Secret。
4. 同时修复 URL 错误恢复、a11y、响应式、安全 headers、生产图片配置和依赖审计。
5. 汇总一次性 USER_ACTION_PACKET：只列托管/域名/邮件、库存与履约路线、运费、退货退款责任、税务/政策等真正需要用户决定的外部事实。
6. Reviewer 复审通过后，再执行生产基础设施、live PayPal、真实小额订单、备份恢复与上线验收。

## 目前不应修改

- 不更换 Medusa、Next、PostgreSQL，不恢复 Spree 选型。
- 不重新设计冻结的 Figma/Web UI，不因 detector 提示更换字体。
- 不重新选品，不改变现有商品 ID、SKU、原图和 14.99 USD。
- 不把 WorldFirst 当 checkout gateway。
- 不把 UNKNOWN 的库存、物流、HS、税务、退货信息补成假事实。
- 不开启客户 PayPal、live endpoint、自动 capture 或自动 fulfillment。
- 不清理历史报告/demo，不重置现有数据库/Docker volume，不回滚已有未提交进展。

## Reviewer 决定

`BATCH-03=PARTIAL_PASS_RETURN`

`LOCAL_RUNTIME_AND_CONTRACT_BASE=PASS`

`CUSTOMER_PAYMENT=RETURN`

`SANDBOX_VERTICAL_SLICE=RETURN`

`PRODUCTION_INVENTORY=RETURN`

`LAUNCH_READY=NO`

下一批合并返修、沙箱纵向闭环、依赖/客户加固与一次性上线输入包，减少交互轮次。当前不需要用户介入；执行 Agent 可直接读取下一任务。

