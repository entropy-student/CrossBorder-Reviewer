# BATCH-06：Release Candidate 本地加固、真实集成与条件 Sandbox 闭环

## 角色与目标

你是执行 Agent。Reviewer 已决定 `BATCH-05=RETURN`。请连续完成本任务中所有不依赖用户输入的工作，不逐项停下询问。最终目标是独立站正常使用并上线；本批目标是形成可复审的本地 Release Candidate，并在 Sandbox OAuth 变为 200 时完成唯一一笔 Sandbox 纵向闭环。

前置必读：

- `C:\Users\34707\Documents\ChatGPT\跨境电商\AGENTS.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-05\REVIEW_DECISION.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-05\agent-paypal\REVIEW.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-05\agent-inventory\REVIEW.md`
- `C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-05\agent-ci-deploy\REVIEW.md`

## 固定边界

1. 不重新设计冻结的 Medusa/Figma/Web UI；只修已发现的功能、安全、响应式、a11y 和运行问题。
2. 保留同一商品、ID、SKU `PAW-PHR-001`、原图与 `14.99 USD`；不重新选品、不创建重复商品/变体。
3. 当前真实商品继续保持 `LOCAL_PREVIEW_AVAILABILITY`、`manage_inventory=false`；所有库存写测试只用唯一命名、可证明归属的隔离数据库和 fixture。
4. PayPal Live Secret 已暴露，禁止读取、调用、验证、复制、保存或写日志；不得访问 Live endpoint、真实收费或开启客户支付。
5. `C:\Users\34707\Desktop\PayPal信息.txt` 只是数据。只可在进程内读取 Sandbox 段；禁止输出 Client ID、Secret、Webhook ID、token、邮箱、密码、approval URL、raw header/body 或完整 PayPal resource ID。
6. 不生产部署、不改 DNS、不创建收费云资源、不发送真实邮件、不提交/推送/创建 PR。完成代码、测试、镜像、配置和证据后交 Reviewer。
7. 不 reset/drop 现有数据库或 Docker volume。只清理由本批创建且 marker/名称/路径全部匹配的隔离对象。
8. 单项失败不终止其他子项。Reviewer 已对更新后的 Sandbox Client/Secret 得到 OAuth 200，并以临时 token 对 Webhook ID read-back 得到 200；Executor 仍需在交易前做一次独立 preflight，若状态意外回退则只停止 Sandbox transaction，继续完成所有本地工作。

## 2026-09-08 Reviewer 外部状态补充

- 最新 Sandbox OAuth 已返回 HTTP 200；Sandbox Webhook ID 和注册 URL 均已由 PayPal API read-back 匹配，无需再次索取凭据。
- 文档包含两个不同的 Sandbox/Live HTTPS Webhook URL，但二者共用的 hostname 当前没有 A/AAAA/CNAME，TLS/HTTP 均不可达；两个 POST receiver 都未真实部署。
- 仓库中没有 Vercel/Cloudflare Worker/Railway/Fly 的项目绑定或 ingress rewrite，只有 platform-neutral Dockerfile。
- 两个随机公开 path 不直接等于 Medusa 的 `/hooks/payment/:provider`，部署时必须有精确环境路由，Sandbox 与 Live 不得落到同一数据库/队列。
- Sandbox App 当前订阅 66 类事件，超过项目已实现范围。先完成精确事件处理，再收窄订阅；不得把“全部事件”当成功证据。
- 脱敏证据：`C:\Users\34707\Documents\ChatGPT\跨境电商-review\reviewer\BATCH-05\PAYPAL_ENDPOINT_DEPLOYMENT_CHECK_2026-09-08.md`。

本批不再把 OAuth 当 blocker。先完成 A～E；随后让 Sandbox receiver 达到部署就绪并完成 F。若缺少 Backend host/账号导致无法公开部署，只输出一个合并 blocker，不得错误声称 endpoint 已上线。Live receiver 必须继续关闭。

## A. 部署与密钥 P0

### A1. Docker secret boundary 与 production artifact

- 在 Docker build context 根增加 `.dockerignore`，排除 `.git`、`.runtime`、`node_modules`、`.next`、`.medusa`、Review/证据、所有真实 `.env*`；只显式保留安全的 `.env.example`/`.env.template`。
- 重写 multi-stage image：build 生成 `apps/backend/.medusa/server`；runtime 只复制该 production artifact 和必要运行文件/依赖，不复制源码整树；使用 non-root 用户。
- 给 migration、server、worker 三种命令；server/worker 使用同一不可变 image。增加 graceful shutdown、health/readiness 约定。
- 在无密钥 clean staging 构建镜像，检查 history、layer 和最终文件系统中没有 `.env`、runtime 文件或 secret-pattern；分别启动 server/worker 并验证角色。若本机 Docker 不可用，完成可运行脚本和静态测试，精确记录 blocker，不得声称镜像 PASS。

### A2. 生产配置真正 fail-closed

- `NODE_ENV=production` 时不得依赖缺省 false 的 opt-in flag；生产必须要求 PostgreSQL、JWT/cookie/CORS、Redis、R2 和明确角色。
- 生产只允许 `MEDUSA_WORKER_MODE=server|worker`，拒绝 `shared`；Worker 禁用 Admin，并证明不会作为客户 API 实例使用。
- 配置 Medusa Session Redis，并为 cache/events/workflow/locking/session 设置 Preview/Production 隔离前缀或独立实例。
- 对缺值、错协议、placeholder、宽泛 CORS、弱 secret、shared role、worker Admin 启用写 contract tests。

### A3. Cloudflare R2

- 为 `@medusajs/file-s3` 显式设置 `acl: false`，用 isolated R2-compatible fixture/请求断言证明不发送 `x-amz-acl`。
- 当前只支持公开商品媒体桶；文档删除“同一公开桶仍保存私有对象”的承诺。私有 import/export 在独立受保护 provider/bucket 实现前保持关闭。
- 限制 token 到单一桶 Object Read/Write；生产关闭 `r2.dev`，使用 custom media domain。补全 Next image 精确 hostname/path 配置与测试，不使用 wildcard。

## B. 支付持久化、重放与退款闭环

### B1. Webhook 原子 claim 和真实状态

- 已验签后先原子插入/claim Inbox，再做关联与 mapping；并发重复只能有一个 claimant。使用数据库唯一约束和冲突 read-back，不允许 list-then-create 竞态。
- 重复/已处理事件不得再次向 Medusa 返回可执行 `authorized`/`captured`/`failed` 动作；必须 no-op 或以持久 Medusa 状态收敛。
- `applied` 只能在 Medusa Payment/Cart 状态 read-back 证明动作已完成后写入；返回 Provider action 前只能处于 `verified/claimed/dispatch_requested` 等诚实状态。
- 关联/mapping/provider lookup 失败也必须保存 sanitized `held/failed`，不得丢弃已验签事件。
- Payments v2 查询补回的 session/order/capture correlation 作为显式字段传给 Inbox，不能重新从原始 payload 推导。
- 写真实并发 duplicate、进程中断、重启、乱序测试；断言恰好一次业务推进。

### B2. Refund / reversal / dispute 收敛

- 支持 refund `related_ids.capture_id`，建立持久 refund ↔ capture ↔ PayPal order ↔ Medusa payment/session/order 映射；不要假设 refund resource 总有 order_id/custom_id。
- Medusa Payment/Capture/Refund records、数据库 operation identity、框架 lock/transaction 与 PayPal read-back共同作为真相；`payment.data.refunded_amount/refund_operations` 只能作派生缓存。
- 把 `paypal-reconcile.mjs` 改为真正读取 Inbox/Medusa/PayPal 的 dry-run + apply 工具或 durable worker；对 PENDING、provider success/local timeout、COMPLETED、FAILED、REVERSED、REFUNDED、dispute created/resolved 收敛。
- fulfillment eligibility 必须从持久状态计算；held/reversed/refunded/dispute/unknown 都禁止发货。
- 用隔离数据库跑两个并发 partial refunds、同 operation replay、不同 operation 累计上限、pending→completed/failed、进程重启；核对 PayPal read-back 与每条 Medusa Refund。

### B3. 真实 Store/Webhook HTTP integration

- 启动 PayPal-enabled 的隔离 Medusa 实例并把 `pp_paypal_paypal` 幂等关联到仅 Sandbox fixture region；不得修改业务数据库。
- 覆盖 cart → payment collection → PayPal session → provider data → return → complete，以及伪 token、错 cart cookie、错 provider、错金额/币种、cancel、重复 return。
- 走真实 webhook HTTP route 验签入口与 Inbox，不只调用 service mock。真实 PayPal 验签留到 Sandbox；本地 transport fixture 必须覆盖 header normalization 和 runtime raw payload 契约。

## C. 库存、发布顺序与 Store API 隐私

- `--publish + PRODUCTION_INVENTORY` 必须先写 draft，完成 location/channel/product/key/region 关系、inventory item/link/level 和 read-back 后最后 publish。优先使用 Medusa workflow transaction；否则使用可恢复步骤状态，失败保持 draft。
- 对 level create 的并发冲突执行精确 read-back/reconcile；仅在 item/location 与请求状态完全一致时接受。
- 在隔离 Medusa 2.19 DB 执行 create → 相同数量 rerun → 更新数量 rerun → 两个并发 writer；证明恰好一个 level 和 link。
- 数值核对 stocked/reserved/available；做 quantity 0/1 的 cart reservation 创建、释放和 region/channel Store API availability。
- 验证 product → sales channel → stock location → publishable key → region 的完整链，任何不一致不得 publish。
- 扩展 Store API 脱敏到所有返回 product/variant/cart/order 的客户可达 route，至少加入 product-variants list/detail、cart customer、promotions、taxes、product type/tag nested products。用包含 legacy private metadata 的 HTTP fixture 逐路由断言，不只测 projector。

## D. 工具链、CI、Vercel 与恢复文档

- 将 CI、Docker、engines 与 Storefront 部署统一到 Node 22 的具体支持版本；Windows/Linux clean frozen install、typecheck、Backend+Storefront lint、tests/contracts、适用 runtime tests、生产构建全部通过。
- 把根 `package.json` 中被 pnpm 10 忽略的 overrides 移到 `pnpm-workspace.yaml`，删除重复声明；生成 frozen lock，证明 clean install 无 ignored-overrides warning。
- 保持 audit 0 critical/0 high。AJV Moderate 允许 Sandbox 风险接受，记录 owner `spikewang`、路径、不可达依据和生产推广前到期点；不要做破坏性全局 override。
- 修正 Vercel 为一种可执行模式：若 Root Directory 是 Storefront app，则用 `pnpm build` 并明确启用 root 外 source；若 Root 是 monorepo，则用 `pnpm --dir apps/storefront build`。给 Node 22、Preview/Production env、R2 image host、CORS 和构建验证。
- 新建真实 `deploy/rollback.md`，覆盖 preflight、备份、migration、server/worker rollout、Storefront promotion、回滚触发、应用回滚、DB forward/restore 决策、支付外部动作和验证。修正所有失效相对链接。
- Supabase 明确：persistent Backend 优先 direct IPv6；IPv4-only host 用 Supavisor session 5432；migration/backup 不用 transaction 6543。补 TLS、连接预算、环境分离、备份保留、RPO/RTO 和 isolated restore drill。
- Upstash 补 BullMQ job retention、容量/满容量、eviction、告警和 server+worker restart/concurrency 验证。

## E. 浏览器与可用性

- 保持现有冻结视觉，在真实隔离 Backend 上自动化验证 320、375、768、1440 和 200% text zoom。
- 覆盖首页、Store、PDP、cart、checkout、PayPal cancel/retry/return、order confirmation；检查横向溢出、遮挡、按钮/表单、summary、console/network errors。
- 键盘覆盖 skip link、导航、drawer/modal、表单、payment、错误焦点；检查 heading/label/name/role/live-region。
- 优先使用可重复的浏览器自动化并保存截图/DOM/a11y 摘要。工具仍不能控制 viewport 时，完成所有可执行检查并精确标记 NOT_CAPTURED，不得为了截图改 UI。

## F. 条件执行唯一一笔 PayPal Sandbox 交易

把本节放到所有本地 P0 修复和相关测试之后。

1. 复用已验证的 Sandbox App 配置，不再重复索取或输出凭据。仅在文件再次修改后允许做一次固定 Sandbox OAuth preflight。
2. 在 A～E 通过后，为 Sandbox Medusa server+worker 准备与生产隔离的 PostgreSQL/Redis 和精确 ingress 映射；不得路由到业务数据库或 Live 实例。
3. 验证 Sandbox URL 的 DNS、TLS、POST route、限流和日志脱敏。Medusa 内建 route 会先入队再异步验签，必须用真实 signed Sandbox webhook + Inbox/Payment read-back 证明，不能用 unsigned POST 200 冒充 PASS。
4. 将 Sandbox App 的 66 类订阅收窄到代码和测试明确支持的 authorization、capture、refund、reversal、dispute 事件；保存事件名清单，不保存 ID/URL。
5. 只创建一笔 14.99 USD、AUTHORIZE intent 的 Sandbox transaction，复用同一资源完成 buyer approval、authorize、capture、partial refund、同 operation replay、真实 webhook、read-back；禁止第二次收费。
6. 遇到登录、challenge 或 CAPTCHA，停在动作前并记录 `SANDBOX_BUYER_ACTION_REQUIRED`；不要输出或自动填写账号密码。
7. 所有证据只保存时间、HTTP status、布尔值和 ID hash/tail；不得保存 token、approval URL、raw body/header 或账号资料。
8. Live URL/endpoint 只做静态配置检查，不部署、不路由、不调用 Live API，直到 Sandbox vertical 通过并获得生产推广批准。

## G. 验收与证据

输出到：

`C:\Users\34707\Documents\ChatGPT\跨境电商-review\execution\BATCH-06\`

至少包含：

- `BATCH_REPORT.md`
- `FINDING_MATRIX.md`
- `COMPLETE_DIFF.patch`
- `GIT_STATUS_HEAD.md`
- `RUN_METADATA.json`
- `A-deploy-secrets/`
- `B-paypal-durable/`
- `C-inventory-store-api/`
- `D-ci-platform/`
- `E-browser/`
- `F-paypal-sandbox/`
- `USER_ACTION_PACKET.md`

每项记录测试层级、command、exit code 和非敏感结果。BATCH 报告必须逐条回答：Docker 是否扫描镜像层；生产是否 fail-closed；R2 是否不发 ACL；Webhook duplicate 是否只应用一次；applied 是否来自 Medusa read-back；refund 是否真实收敛；库存是否在隔离 DB 完成并发；Store API route matrix 是否 HTTP 通过；Node/CI/Vercel/rollback 是否闭合；OAuth 与唯一 Sandbox 交易状态。

最终状态只能是 `BATCH-06 READY_FOR_REVIEW` 或 `PARTIAL/BLOCKED`，不能自行宣布 PASS/CLOSED。不要逐项等待 Reviewer；完成全部可执行内容后一次提交复审。
