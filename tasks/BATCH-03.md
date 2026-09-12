# BATCH-03：交易正确性、PayPal 沙箱闭环与上线前阻塞

用户要求按批执行、集中验收，减少往返轮次。最终目标：独立站正常使用并上线。本批合并 BATCH-02 的代码返修、PayPal 沙箱纵向联测和最小履约准备；完成后一次提交给 Reviewer。Executor 不宣布 PASS、正式收款或上线。

源码根：`C:\Users\34707\Documents\ChatGPT\跨境电商\CrossBorder-Independent-Store`。
应用根：源码根下 `03_template/medusa-crossborder-base`。
Review 根：`C:\Users\34707\Documents\ChatGPT\跨境电商-review`。

先读适用 AGENTS.md、`reviewer/BATCH-02/REVIEW_DECISION.md`、`02_PAYMENT_BACKEND.md`、`03_STOREFRONT.md`、`05_PRODUCT_SUPPLY_CHAIN.md` 和实际工作树。BATCH-01/02 的未提交变更属于当前工作，必须保留；保存本批起点 HEAD/status/diff/hash。Review 文档只读。不要重新做全项目 Review。

## 工作包 A：收尾 BATCH-02 返修

### A1 进程、服务和 CI

- 在 `scripts/_common.ps1` 中保持进程身份、启动时间、可执行文件、命令行和项目路径验证；进程树只收集创建时间不早于已验证父进程且身份可读的真实子进程，保留 visited 防环。每个子进程在终止前再次核对；不匹配或读取失败即停止整个终止操作。
- `Stop-ManagedProcess` 必须返回可判断状态；身份未知、停止失败或仍有不安全存活进程时，`build-production.ps1` 必须阻断移动 `.medusa/.next` 和后续构建。不能 catch 后继续。
- 服务复用接受实际启动链（node/Corepack/pnpm/Next 的可信父子链），同时拒绝不在可信链的监听进程；首次启动 HTTP 200 后再次核对 listener 身份。不要通过“接受任意后代”放宽安全边界。
- staging 测试在没有外层文档、demo 仓库、`.env`、`.runtime`、缓存和依赖的源码检出中也能运行。让可选 demo 缺失成为明确 `NOT_AVAILABLE` 或由独占 fixture 提供，不挂载用户父目录；故障注入使用唯一副本路径并证明同一个顶层 verify 会因真实诊断失败。所有测试 cleanup 独立检查绝对路径、归属和 reparse。
- CI 与本地完整入口保持一致：类型、lint、真实单测/契约、三组运行安全测试和构建都必须有明确结果。远端未运行则继续记录 `NOT_RUN_REMOTE`，不能冒称远端 PASS。锁文件只由包管理器更新。

### A2 商品、组件和库存门槛

- Product Master 的 dry-run 与实际 write 共用一个公开 payload builder；生产模式明确写入/恢复原生 `manage_inventory`，并验证库存位置、数量、零库存及最后一件并发语义。`UNKNOWN` 库存/履约不得转成正式可售。
- `TEST_FIXTURE_ONLY`、无效图片 URL、非法价格/重量/数量、矛盾 options 和第二变体错误价格必须阻断发布；读回覆盖全部变体的 SKU、option、价格、币种、状态、库存字段。不要只增加字符串检查。
- Component Master 允许有证据的 `VERIFIED` 事实；`NO_INVENTED_FIELDS` 不得通过禁止合法核实状态实现。`test_status=FAIL` 与 `decision=NOT_TESTED/PENDING` 的矛盾组合必须明确 BLOCK/REJECT，hard fail 永远拒绝采购。增加组合矩阵并接入统一 verify。
- 保留同一个正式商品、原图和 `$14.99`；不要重新选品、批量清理或重置现有目录。除非隔离数据库明确需要，不再写现有商品作测试；本批任何既有数据写入要单独记录并先停止相关测试。

### A3 客户流程剩余缺口

- SF-01：邮箱保持真正只读，不呈现会提交的 Edit/Save 假操作；不开发邮箱迁移认证系统。
- SF-02：订单、账户、购物车、结账使用明确 `no-store`/有限 TTL；地区缓存必须能刷新和删除，不由永久 `force-cache` 重新灌回旧值。
- SF-04/09：支付失败、处理中、已取得支付证据但订单同步失败、重复返回分别有可恢复状态；缺 `captured_at` 不显示 paid time，缺捕获证据不称 captured/paid。读取 URL 不能决定资金状态。
- SF-03/05/08/10/14：对加购、支付方式初始化、API 故障、账户切换、订单转移 GET 预取分别做真实边界测试；保留已有 finally、404 与 POST 修复。
- SF-06 只处理现有明确 404 和缺口清单，不编造配送/退款承诺。冻结视觉、页面结构与 Medusa/Figma 选型。

## 工作包 B：PayPal provider/transport 正确性

继续使用 Medusa Payment Module 作为唯一运行契约，Provider 默认 fail-closed；当前只允许 sandbox。用户文件只在本机进程内读取，绝不复制或输出 Client Secret、token、账户密码、邮箱、完整 API 响应或任何凭据。

- `transport.ts` 所有 JSON 请求明确 `Content-Type: application/json`；OAuth 表单保持 `application/x-www-form-urlencoded`。请求失败按 408/429/5xx 与 4xx 分类，非重试错误不能重复发三次；重试要有有限次数、退避、超时和不泄露响应的错误。
- `paymentEvidence` 必须保留并正确映射订单、authorization、capture、refund 资源自身状态。`PENDING` capture 不能返回 captured；VOIDED、DENIED、REFUNDED、PARTIALLY_REFUNDED 和未知状态按明确状态处理。订单顶层 `COMPLETED` 不能覆盖资源状态。
- create/update/authorize/capture/refund/retrieve 的订单、资源 ID、金额、币种、环境和本地 session/correlation 绑定全部校验；缺任何最终资金确认所需证据即拒绝或进入 pending，不能复制请求金额冒充网关证据。
- 退款重放、不同操作相同金额、超时后远端成功、pending→completed/failed、并发部分退款必须有可追踪的唯一操作和原生持久记录。若 Medusa 当前接口无法安全表达并发，不在 provider 内伪造第二本账；改为明确 HOLD/人工对账并记录原因。
- webhook 先验签，再检查 event ID、resource ID、session/order、商户环境、金额和币种；持久去重、乱序、重试、重启、退款/逆转/争议的处理要有项目落点。缺绑定信息的 mapper 结果不得直接变成 captured/authorized。核对 Medusa 2.19 实际 subscriber 契约，不修改第三方源码。
- 技术 System Payment 和测试 shipping 的列表过滤、创建、选择、complete 全部在 customer mode 后端拒绝；不要只依赖名称黑名单，也不要破坏本地 technical_test mode。

所有新反例接入 `verify`。测试层次必须标为 `MOCK`、`ISOLATED_DB` 或 `SANDBOX`，不能把 mock 绿色当真实支付闭环。

## 工作包 C：限定 PayPal 沙箱纵向闭环

先在本机从 `C:\Users\34707\Desktop\PayPal信息.txt` 读取已确认的 sandbox App Client ID/Secret。OAuth endpoint 固定为 `https://api-m.sandbox.paypal.com/v1/oauth2/token`，不跟随重定向，不向其他主机发送凭据。已确认 OAuth 成功；本轮不要重复无意义认证，可按 token 缓存需要复用临时 token。

在 PayPal Developer sandbox 使用现有商户 Business 与买家 Personal 账号完成最小一单，金额只使用现有 USD 商品的低风险测试金额/单品；不得调用 live endpoint，不得创建或修改生产配置。若文件中买家密码/账户资料不适合自动登录，记录 `SANDBOX_BUYER_ACTION_REQUIRED`，继续完成不依赖浏览器批准的技术部分，不把它写成失败或要求用户在聊天贴密码。

闭环必须记录每一步的脱敏结果和远端资源 ID 的哈希/尾部标识（不要记录完整 token、secret、账户邮箱或响应原文）：

1. create order：金额、币种、intent、correlation/idempotency 绑定正确。
2. buyer approval/return：关闭/重复返回可恢复；不能由 URL 直接宣布付款。
3. authorize：订单与 authorization、金额币种一致，状态为 authorized。
4. capture：完成后只有真实 COMPLETED/CAPTURED 证据才进入 captured；PENDING/失败保持正确状态。
5. webhook：配置已有 Webhook ID 或在沙箱 Dashboard 受控读取配置；验签、去重、乱序和重启恢复有证据。若没有 Webhook ID，必须把“事件联测未完成”与 OAuth 成功分开。
6. refund：完整/部分退款、同操作重放、超时恢复至少各一例；不做第二次真实扣款，金额不超过 capture。
7. Medusa read-back：订单、支付 collection/session、authorization/capture/refund 状态与 PayPal 证据一致；无重复订单；发货资格只在明确捕获及履约 gate 通过后出现。

沙箱联测只能使用隔离的本地数据库/测试 region/cart；不得重置用户已有 Docker volume。若确需创建临时数据库，创建和 cleanup 目标必须先独立确认，不得删除未知目录。所有远端调用记录 endpoint 类别、HTTP 状态、脱敏 ID、开始/结束时间、退出码；不记录原始 body。

## 工作包 D：最小履约与上线阻塞清单

只做事实和准备，不自行决定业务政策：

- 盘点现有商品的 project-owned inventory、包装/重量/原产地/HS、消费者履约路线、物流时效、退货地址、退款责任人；没有证据就标 UNKNOWN/HOLD。
- 将 capture/发货时点与履约 gate 写成一页可执行流程，允许低单量人工发货、追踪、退款和对账；不引入 ERP/PIM/多网关。
- 更新 `EXTERNAL_PREREQUISITES.md`，区分已验证、需用户业务决定、需 PayPal Dashboard/远端 CI、需生产凭据。不要让“OAuth 成功”替代商户资格、税务、域名、邮件、政策、备份恢复。

## 禁止事项

不修改冻结 UI/Figma 设计，不重新选品，不接 WorldFirst checkout，不开 PayPal live，不真实收费，不发真实订单，不向客户开放未通过闭环的支付，不自动配置生产 webhook，不删除/重置用户数据库或 Docker volume，不提交/推送/建 PR，不把远端沙箱资源当生产资源。

## 一次集中交付

证据目录：`Review根/execution/BATCH-03/`，子目录 `A-runtime-ci`、`B-product`、`C-storefront`、`D-paypal-contract`、`E-paypal-sandbox`、`F-fulfillment`。

交付：`BATCH_REPORT.md`、`FINDING_MATRIX.md`、`COMPLETE_DIFF.patch`、`RUN_METADATA.json`、`GIT_STATUS_HEAD.md`、`EXTERNAL_PREREQUISITES.md`。每项保留原始 stdout/stderr；敏感 API 只保留白名单化状态，不保留响应原文。矩阵使用 `CLOSED_CANDIDATE`、`PASS_LOCAL_ONLY`、`SANDBOX_PARTIAL`、`BLOCKED_EXTERNAL`、`NOT_RUN`，不自行写 Reviewer PASS。

整批一次报告 `BATCH-03 READY_FOR_REVIEW` 或 `PARTIAL/BLOCKED`。若买家手动批准、Webhook 配置或业务履约事实需要人操作，只在最终报告合并列出，不中途反复询问。继续完成所有不依赖它的安全和代码工作。
