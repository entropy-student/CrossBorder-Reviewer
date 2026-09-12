# BATCH-04 独立复审决定

日期：2026-09-07  
Reviewer：独立 Reviewer / Planner  
最终目标：独立站正常使用并上线

```text
BATCH-04=PARTIAL_PASS_RETURN
LOCAL_TYPE_TEST_CONTRACT_RUNTIME=PASS
CI_LOCAL_CLEAN_BUILD=PASS_WITH_REMOTE_GAP
PAYPAL_LOCAL_PROVIDER=PARTIAL_PASS
PAYPAL_PERSISTENT_RECONCILIATION=RETURN
PAYPAL_SANDBOX_VERTICAL_SLICE=RETURN
PRODUCTION_INVENTORY=RETURN
PRODUCTION_INFRASTRUCTURE=RETURN
DEPENDENCY_RELEASE_GATE=RETURN
LAUNCH_READY=NO
```

## 总体评价

BATCH-04 对 BATCH-03 的多个静态问题做了实质改进：CI 可以在没有开发者 Backend 的构建阶段完成；PayPal transport、Payments v2 order correlation、客户 sandbox 分支、错误恢复、metadata key 对齐、生产库存写计划、安全头和响应式细节都有代码落点；本地 typecheck、31 项 Backend tests、产品/支付/组件 contracts 与 runtime 安全测试通过。

整批仍然 RETURN。主要原因是新增的持久对账只是未接线的数据模型，Sandbox 纵向交易完全没有执行，生产库存写入没有真实或隔离数据库证明，生产基础设施只是用户选型而未接入，依赖审计还有 4 high。当前代码适合继续工程验收，不适合开放客户支付或生产订单。

## 独立验证

- Reviewer 重新运行 `corepack pnpm@10.11.1 run typecheck`：退出码 0。
- Reviewer 重新运行 `corepack pnpm@10.11.1 run test`：31/31 Backend tests、支付/商品/组件/库存 contracts 通过，退出码 0。
- Reviewer 重新运行统一 `verify`：退出码 0；RT-02 9/9、RT-03 7/7、RT-04 failure injection、RT-01 37 PASS / 0 FAIL / 1 symlink SKIP。
- 复核 executor clean checkout、no-backend production build、Backend build 与本地 HTTP 200 证据，内容与报告基本一致。
- 公共 DNS 独立探测：`spikspikeapi.dpdns.org` 当前没有 A/AAAA/CNAME，HTTPS 不可达。
- Reviewer 未创建订单、未修改数据库、未调用 PayPal/WorldFirst、未使用 Live 凭据，也未修改主项目。

原始复测日志：[independent-core-checks.log](independent-core-checks.log)。
域名探测日志：[dns-domain-probe.log](dns-domain-probe.log)。
复审元数据：[REVIEW_METADATA.json](REVIEW_METADATA.json)。

## 通过项

1. CI 使用固定 Node 20.19.0、Corepack pnpm 10.11.1、frozen install 和统一 verify/build 入口；本地 clean-checkout 证据有效。
2. PayPal transport 固定 sandbox API host，具备超时、有界重试、401 token refresh、请求幂等键、金额/币种/资源 ID 校验。
3. Payments v2 capture/authorization webhook 缺少 `custom_id` 时，可通过 related order ID 查询 order 并恢复 Medusa session correlation；单元 fixture 有效。
4. 客户 PayPal sandbox 按钮只接受 HTTPS sandbox PayPal approval host，默认 customer 模式仍关闭 PayPal。
5. 商品 builder 与 public allowlist 已统一使用 `pawfectly_*` keys；纯函数 catalog projection tests 通过。
6. checkout 错误 live-region、恢复文案、部分移动端布局、Next production image optimization 和基础安全头已有改善。
7. 用户外部事实文档诚实保留 UNKNOWN/HOLD，没有虚构库存、物流、税务或退货事实。

## 必须 RETURN 的问题

### R1 — 持久 Webhook inbox 没有接入运行数据流（P0）

`paypal-reconciliation` 当前只有 model、MedusaService 和 module registration。源码中没有其他调用者，没有接收事件、唯一插入、状态转换、重放、乱序处理、失败恢复或人工 reconcile 命令；也没有生成/验证 production migration。`event-inbox-contract.log` 仅证明 TypeScript 编译和 model 上声明了 unique，不能证明数据库唯一约束或重启恢复。

事件表自身也不一致：service 声明 capture pending/reversed/refunded、refund pending/failed 等为 actionable，但实际 mapper 只处理 authorization created/voided 与 capture completed/declined/denied；其余事件落入 `not_supported`。因此当前不能可靠关闭发货资格或收敛异步退款。

### R2 — 退款仍以 payment session data 作为并发真相（P0）

`refundPayment` 继续依赖 `data.refunded_amount` 和 `data.refund_operations` 计算累计退款。两个并发请求可以读取相同旧值；provider 成功而本地写回超时时也没有可靠恢复。Pending refund 没有 provider refund read-back 路径，新增 inbox 又未接线，因此不能把退款/逆转状态作为 fulfillment gate 的可信来源。

同一 PENDING operation 重试时会直接再次返回 pending，没有 retrieve-refund API 或后台 reconcile 使它变成 completed/failed。

### R3 — PayPal 客户链路缺少真实 Medusa 与 Sandbox 证明（P0）

31 项 tests 主要是 service/HTTP fixture。没有隔离 PostgreSQL 上通过真实 Store API 创建 payment collection/session、approval return、cart completion、Medusa order/payment/capture/refund 的集成证据。BATCH-04 明确授权了一笔 Sandbox 交易和 browser buyer approval，但执行结果仍是零 sandbox order、零 approval、零 authorize/capture/refund、零真实 webhook。

Backend 只在 provider enabled 时检查 Client ID/Secret，没有同时要求 Webhook ID、return URL、cancel URL，也没有证明 Backend `MEDUSA_CHECKOUT_INSTANCE_MODE` 与 Storefront `NEXT_PUBLIC_CHECKOUT_EXPOSURE_MODE` 始终一致。环境错配可能造成半开放或不可恢复的 checkout。

### R4 — 生产库存写入不是可重跑的 upsert（P1）

`inventoryLevelRequest` 固定向 location-level collection 发送 POST create。相同 item/location 重跑会与既有 level 冲突，而测试只断言请求对象，没有覆盖 create→rerun→quantity update、并发、reserved/available quantity、stock location 到 sales channel 的可售关系。真实商品仍是 local preview，未写生产库存是正确行为。

### R5 — Store API metadata 边界覆盖不完整（P1）

递归 projector 本身通过单元测试，但 middleware 只挂到少数 GET detail 路由。购物车 mutation、complete response、订单列表/客户订单等可能携带嵌套 product/variant 的 Store API 响应尚未建立完整矩阵。更稳妥的根治方式是确保写入 commerce product/variant metadata 的内容本身只有公开 allowlist，再把响应投影作为第二层保护。

### R6 — 生产部署架构尚未成立（P0）

用户已选择 Vercel、Supabase PostgreSQL、Upstash Redis、Cloudflare R2、Cloudflare DNS，并可选 Resend，但当前源码只有 `DATABASE_URL` 被 Medusa config 使用：

- `REDIS_URL` 只出现在 env template/setup，没有配置 event bus/cache/workflow/locking；
- 没有 R2/S3-compatible Medusa file provider；
- 没有 Resend notification provider；
- 没有 production migration、server/worker 双进程、备份/恢复、健康检查和 rollback 证据；
- Vercel 可承担 Next.js Storefront，但当前没有证据支持把需要常驻 server/worker 的 Medusa Backend 放在 Vercel Functions。

Medusa 官方部署说明要求生产 PostgreSQL、Redis，并分别部署 server 与 worker；推荐至少 2GB RAM。Supabase 对常驻 Backend 建议 direct 或 session pooler，对 migration 使用 direct/session connection。参见：

- https://docs.medusajs.com/learn/deployment/general
- https://supabase.com/docs/guides/database/connecting-to-postgres

### R7 — 依赖与 CSP 仍有发布阻断（P1）

生产 audit 仍为 0 critical / 4 high / 7 moderate。报告已经列出 lodash、sharp、postcss、ajv、uuid、qs 路径，但没有升级或形成有到期日的不可达豁免。安全目标尚未达成。

此外 CSP 的 `frame-src` 包含 `js.stripe.com`，但 `script-src` 没有它；现有 Stripe Elements 若被启用会在 production 被 CSP 阻断。production 仍包含 `'unsafe-eval'`，应在真实 build/runtime 验证后尽量移除。

### R8 — 浏览器级可用性证据缺失（P1）

没有完成键盘、读屏语义、320/375/768/1440、200% zoom 和支付恢复路径的当前版本浏览器验收。Reviewer 用 executor 的 no-backend build 启动时得到 HTTP 500，因为 NEXT_PUBLIC backend URL 在 build 时被固定为不可达 fixture；这不否定 hermetic build，但证明 build PASS 不能替代带真实 Backend URL 的运行验收。

### R9 — Domain 尚未指向服务（P1）

用户给出的 domain 已记录为目标，但公共 DNS 目前没有站点记录，HTTPS 不可达。应等 Storefront deployment 与 Backend host 都确定后，再设置 storefront/API 记录、CORS、TLS、Webhook URL 和邮件 DNS，不能提前宣布 production domain ready。

## 用户输入判定

详见 [USER_INPUT_RESOLUTION.md](USER_INPUT_RESOLUTION.md)。库存、物流、包装、HS、退货等 3～5 项可以以后补；现在保留 HOLD 即可。它们不阻塞 BATCH-05 的工程、Sandbox、CI 和部署模板，但阻塞 Live checkout 与上线。

用户在聊天中发送的 PayPal Live Secret 已视为暴露，禁止后续使用。上线前必须轮换，新值只能进入生产 Secret Manager。

## 优先级与执行顺序

1. 接通 persistent inbox、数据库 migration、真实 webhook/replay 与退款锁/对账。
2. 用隔离 PostgreSQL 跑真实 Medusa payment/inventory integration tests。
3. 修复 CSP 和 production high advisories，补 Windows + Linux clean CI。
4. 完成唯一一笔 PayPal Sandbox authorize→capture→partial refund→webhook/read-back。
5. 完成当前 UI 的浏览器键盘/响应式/zoom 验收，不改变冻结视觉。
6. 建立 Vercel Storefront + 常驻 Medusa server/worker + Supabase/Upstash/R2 的可部署包；最后集中选择 Backend host。
7. 等用户以后补齐库存与履约事实，再做生产部署、Live 小额订单和上线。

## 当前不应该修改

- 不重做 Medusa/Figma/Web UI，不改变品牌视觉、字体和信息架构。
- 不重新选品，不更换商品、SKU、原图或 14.99 USD。
- 不把 UNKNOWN 的库存、重量、HS、运费、时效、退货地址或税务写成已确认。
- 不启用 Live PayPal，不使用刚粘贴的旧 Secret，不调用 WorldFirst。
- 不为了消除 audit 数字做未经回归的大版本盲升。
- 不在履约与支付闭环通过前开放生产 Add-to-cart/checkout。
