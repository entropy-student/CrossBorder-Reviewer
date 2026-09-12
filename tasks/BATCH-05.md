# BATCH-05：支付/库存真实集成闭环、Sandbox 纵向交易与部署包

## 角色与最终目标

你是执行 Agent。Reviewer 已决定 `BATCH-04=PARTIAL_PASS_RETURN`。请一次性完成所有不依赖用户尚未确定的库存/履约事实的工作，并把证据集中交回 Reviewer。最终目标是独立站正常使用并上线；本批目标是达到 `STAGING_TECHNICALLY_READY`，不是自行宣布上线。

前置必读：

- `C:\Users\34707\Documents\ChatGPT\跨境电商\AGENTS.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-04\REVIEW_DECISION.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-04\USER_INPUT_RESOLUTION.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\execution\BATCH-04\BATCH_REPORT.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-04\agent-paypal\REVIEW.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-04\agent-inventory-ui\REVIEW.md`

## 固定边界

1. 保留冻结的 Medusa/Figma/Web UI、品牌、字体和信息架构；只修功能、错误恢复、响应式、a11y 与安全问题。
2. 保留同一商品、ID、SKU `PAW-PHR-001`、原图和 `14.99 USD`；不重新选品、不创建重复商品/变体。
3. 用户的 PayPal Live Secret 已在聊天中暴露，**禁止读取、调用、验证、复制或保存该值**。本批不得调用 live API。生产支付继续关闭。
4. `C:\Users\34707\Desktop\PayPal信息.txt` 仅可在本机进程内读取其中 sandbox App 与 sandbox 买家/商户资料；绝不输出 secret、token、邮箱、密码、完整资源 ID、approval URL、raw request/response/header。
5. 本批允许且要求只创建一笔 PayPal Sandbox transaction，并复用它完成 authorize/capture/partial refund/webhook/read-back；禁止真实收费。
6. 所有数据库写测试使用唯一命名的隔离 PostgreSQL database/region/cart/order；先验证归属，禁止 reset/drop 用户现有数据库或 Docker volume。只清理由本批创建且有明确 marker 的临时对象。
7. 不生产部署、不改生产 DNS、不创建收费云资源、不提交、不推送、不创建 PR。先把部署结果做成可审查 artifact，Reviewer PASS 后再请求一次最终部署许可。
8. 3～5 项外部事实可以以后补；不得虚构自有库存/直发、重量尺寸、原产地、HS、承运商、运费时效、退货地址、税务或政策结论。生产商品购买和 Live checkout 必须继续 HOLD。
9. 执行过程中不要逐项询问用户。只有 PayPal challenge/CAPTCHA 或绝对需要人工账号动作时，记录精确 blocker，继续完成其他项，最终只提出一个合并请求。

## 成功标准与顺序

### A. 修复 PayPal 运行集成

#### A1. 配置一致性与 fail-closed

- `PAYPAL_PROVIDER_ENABLED=true` 时同时要求非占位的 sandbox Client ID/Secret、Webhook ID、HTTPS return URL、HTTPS cancel URL，并限制 URL 为当前测试 Storefront origin/path。
- Backend `MEDUSA_CHECKOUT_INSTANCE_MODE` 与 Storefront `NEXT_PUBLIC_CHECKOUT_EXPOSURE_MODE` 必须由验证脚本证明一致；customer/production 默认都关闭 PayPal，只有专用隔离实例使用 `paypal_sandbox_test`。
- transport、service 和 config 的 environment gate 保持 sandbox-only。本批不得解除 production 三重阻断。
- 增加缺配置、错 origin、模式错配、placeholder 和 production 的失败测试。

#### A2. Persistent event inbox 真正接线

- 为 `paypal_event_inbox` 生成正式 Medusa migration，并在全新隔离 PostgreSQL 上 migrate/read-back，验证 `provider_event_id` 数据库唯一约束。
- Webhook 必须先完成 PayPal signature verification，再以 provider event ID 原子写 inbox；重复事件只能命中同一记录。
- 把 inbox 接到实际 payment webhook 数据流，而不是孤立 model。实现明确状态机：received → verified → applied，失败进入 held/failed；每次转换可在重启后继续。
- 不持久化 credential、token、approval URL、raw headers/body、买家邮箱或地址；只保存安全 ID hash/tail、event type、resource/session/order、amount/currency、状态、时间和脱敏原因。
- 覆盖已声明事件：authorization created/voided；capture pending/completed/declined/reversed/refunded；refund pending/completed/failed；dispute created/resolved。代码声明、分类和实际 mapping 必须一致，不能把声明 actionable 的事件静默变成 not_supported。
- 提供幂等 replay/reconcile CLI，必须要求 sandbox、隔离 DB、明确 event/session ID，默认 dry-run；支持重放、乱序、进程重启、provider 成功而本地超时。

#### A3. 退款与履约资格真相

- 不再仅以 payment session `refunded_amount/refund_operations` 作为并发真相。
- 增加 PayPal refund resource read-back；PENDING 操作能收敛为 COMPLETED/FAILED。
- 使用 Medusa Payment/Capture/Refund records、数据库唯一 operation identity 和框架 lock/transaction（按 2.19 实际 API）防止并发超额退款。
- 验证两个并发 partial refund、相同 operation replay、不同 operation 累计不超 capture、API 成功本地超时、pending→completed/failed。
- fulfillment eligibility 从本地持久 payment/refund/dispute/reversal 状态计算；任何 reversed/refunded/dispute/held/unknown 都不能进入可发货。

#### A4. 真实 Medusa integration tests

不要只用 service mock。用隔离 PostgreSQL 启动真实 Medusa，走 Store API：cart → payment collection → PayPal session → provider data → return → complete；证明 Medusa 2.19 注入的真实 `session_id`、单一 order/payment、重复 return 不重复下单。负面测试覆盖伪 token、错 cart cookie、错 provider、错金额币种、取消返回。

### B. 生产库存与 Store API 隐私边界

1. 将 inventory location level 从固定 POST create 改为真正 idempotent upsert：先读 item/location 关系；不存在才 create，存在则按 Medusa 2.19 官方 update API 更新。使用 server read-back，不通过盲重试掩盖 409。
2. 在隔离 DB 建立 stock location、sales channel、inventory item、variant relation，执行 create→相同数量 rerun→更新数量 rerun→并发，证明只有一个 level。
3. read-back 同时验证 stocked/reserved/available、variant link、stock-location/sales-channel relation和 Store API 对该 region/channel 的真实 availability。
4. 保留 `--production-inventory-write` 显式 gate；当前真实商品因 owned inventory 未确定，禁止 production inventory write。
5. 从写入源头保证 product/variant commerce metadata 只包含公开 allowlist；旧 private keys 的清理在隔离 fixture 验证，不碰真实商品。
6. 建立 Store API route matrix，至少覆盖 product list/detail、cart GET 与 mutation/complete、order detail/list/customer orders。响应中出现 product/variant 时都必须脱敏。纯函数单测之外增加 HTTP integration test。

### C. CI、依赖与安全

1. 保留 Windows CI，并增加 Linux clean job，因为 Vercel/Backend 容器使用 Linux。两个 job 都执行固定 Node/pnpm、frozen install、typecheck、lint、unit/contracts/runtime applicable、backend/storefront production build。
2. clean build 不依赖开发者本地服务；运行 smoke 必须使用明确的隔离 Backend，不能把 build fixture URL 当 runtime PASS。
3. 以最小兼容升级/override 处理当前 advisories。目标 `pnpm audit --prod`: critical=0、high=0；每次调整后完整回归。不得为数字盲升大版本。若 high 确实无法消除，必须给调用路径、不可达证明、owner 和不晚于 30 天的到期日期，由 Reviewer 决定是否接受。
4. 修正 CSP：现有 Stripe 支付若保留，`script-src`/frame/connect/form 必须与实际 Stripe sources 一致；PayPal sandbox sources 只在 sandbox 实例；production 尽量移除 `'unsafe-eval'`，用浏览器证明 Next 正常。不要使用 `*`。
5. 保留 HSTS 仅 HTTPS production，校验 CSP、X-Content-Type-Options、frame、referrer、permissions headers 的实际响应。
6. 修正 7 个 Medusa lint warnings 或把 lint gate 明确设为 warnings fail；最终 CI 不得用“0 errors”掩盖新增 warnings。

### D. 可部署基础设施包（不实际生产部署）

用户已选：Vercel Storefront、Supabase PostgreSQL、Upstash Redis、Cloudflare R2、Cloudflare DNS、Resend 可选。

1. 明确架构：Vercel 仅部署 Next.js Storefront；Medusa Backend 生成 platform-neutral Linux container 和两个命令/进程：server、worker。提供 health/readiness、graceful shutdown、migration job、rollback runbook、最低资源和 region 邻近要求。
2. Medusa config 接入 Redis infrastructure modules（event bus/cache/workflow/locking 按当前 2.19 官方能力）；要求 Upstash native TLS `rediss://`，不能误用 REST URL。无 Redis 时 production fail closed，本地开发可有明确 local fallback。
3. Supabase 分离 runtime 与 migration connection：常驻 Backend 使用合适 direct/session pooler，migration/backup 使用 direct/session；不要把不支持 prepared statements/session features 的 transaction pooler盲用到 migration/worker。
4. 接入 Medusa S3-compatible file provider 以支持 Cloudflare R2；env 包含 endpoint/region/bucket/access keys/public URL，secret 不进源码。Storefront Next image remotePattern 只接受经验证的精确 R2/custom hostname，不能猜 wildcard。给 CORS、public/private asset 与 backup policy。
5. Resend 作为可选 notification provider，未配置/未验证 domain 时 production email 状态明确 HOLD；不发送真实邮件。
6. 给 Vercel monorepo root/build/output/env 配置和 preview/production 分离清单。生成完整 env schema/validator，明确 public 与 secret variables。
7. 生成 DNS plan：目标 domain 当前无 A/AAAA/CNAME；等 Vercel deployment 与 Backend host 确定后再给 storefront/API/Webhook/Resend DNS 的具体记录，不修改 DNS。
8. 输出 `BACKEND_HOST_DECISION.md`：列 2～3 个能运行常驻 Node server+worker、至少 2GB RAM、支持健康检查/滚动部署的平台方案，给价格类别/运维/回滚差异；不要擅自选或创建资源。Medusa Cloud 可以作为一项，另列通用容器平台。该文件是本批结束后唯一新的托管选择题。

### E. 浏览器与可用性验收

1. 使用当前冻结 UI，在真实隔离 Backend runtime 上验证首页、Store、PDP、cart、checkout、PayPal cancel/retry/return、order confirmation。
2. 视口：320、375、768、1440；另做 200% text zoom。检查横向溢出、内容遮挡、按钮/表单可用性和 checkout summary。
3. 键盘：skip link、导航、modal/drawer、表单、payment selection、错误后的焦点；读屏语义检查 heading/label/name/role/live-region。
4. 保存截图、DOM/a11y 结果、console error 和 network failure 摘要；不要只记 HTTP 200。不得调整冻结视觉风格。

### F. 唯一一笔 PayPal Sandbox 纵向闭环

只有 A～C 的相关 gate 通过后执行；BATCH-04 已经授权此 sandbox 行为，不要再次以“外部动作”为由跳过。

1. 从本地文件仅在进程内读取 sandbox App、buyer、business；固定 sandbox hosts，禁止 redirect 携带 credential。
2. 使用真实 Store API 和隔离 DB 创建唯一 payment session/PayPal Order，金额 14.99 USD、intent AUTHORIZE。保存资源 ID 仅 hash/tail。
3. 用 browser/computer-use 完成同一 order 的取消恢复与 buyer approval；若 PayPal challenge/CAPTCHA 阻塞，停在该动作前，记录 `SANDBOX_BUYER_ACTION_REQUIRED`，不要泄露密码，并继续可做项。
4. authorize 后核对 order/authorization/amount/currency；capture 同一 authorization，只有 COMPLETED 才成功。
5. 配置专用 sandbox webhook 和 HTTPS 临时 endpoint，只暴露随机 webhook path并限流；验签并写 persistent inbox。Webhook ID 仅 hash。结束后关闭 tunnel并清理由本批创建的临时 sandbox webhook。
6. 在同一 capture 上做 partial refund、同 operation replay、provider refund read-back；不创建第二次收费，不超过 14.99。
7. Medusa read-back：恰好一个 order/payment、authorization/capture/refund，inbox 唯一，退款/争议后 fulfillment gate 关闭。
8. 证据只保存 endpoint类别、HTTP status、UTC时间、布尔结果和 hashed/tail ID；禁止保存 credential/token/email/password/approval URL/raw body/header。

### G. 状态与证据

输出到：

`C:\Users\34707\Documents\ChatGPT\跨境电商-review\execution\BATCH-05\`

至少包含：

- `BATCH_REPORT.md`
- `FINDING_MATRIX.md`
- `COMPLETE_DIFF.patch`
- `GIT_STATUS_HEAD.md`
- `RUN_METADATA.json`
- `A-paypal-integration/`
- `B-inventory-catalog/`
- `C-ci-security/`
- `D-deployment-package/`
- `E-browser/`
- `F-paypal-sandbox/`
- `BACKEND_HOST_DECISION.md`
- `USER_ACTION_PACKET.md`

每个命令记录 command、exit code、测试层级和非敏感 stdout/stderr。最终状态只能是 `BATCH-05 READY_FOR_REVIEW` 或 `PARTIAL/BLOCKED`，不能自行 PASS/CLOSED。

最终一次报告必须明确：

- 是否生成并真实 migrate inbox；是否 webhook 经过 inbox；
- 是否完成 Store API payment integration test；
- 是否创建唯一 sandbox order、buyer approved、authorize、capture、refund、真实 webhook；
- 是否验证 refund/replay/restart/concurrency；
- 是否真实验证 inventory create/rerun/update/concurrency；
- audit 数字、Windows/Linux CI、浏览器矩阵；
- 是否调用 live/WorldFirst、是否使用已暴露 Secret、是否泄露凭据；
- 是否触碰真实商品/现有 DB/订单；
- 唯一仍需用户决定的事项。

