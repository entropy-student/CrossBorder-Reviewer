# BATCH-02 独立复审：PARTIAL PASS / RETURN

日期：2026-09-06。最终目标：独立站正常使用并上线。下一批把未完成项与可依赖的沙箱联测合并，不能把本批整体记成完成。

## 最重要的校准

PayPal 原输入并不缺 App Client ID/Secret。Reviewer 在指定本地文件第 4/5 行识别到明确字段与对应值，未输出值；以它们向固定官方 sandbox OAuth endpoint 请求一次，HTTP 200，认证成功。文件还含沙箱账户资料。Webhook ID 不是 OAuth 前提。执行方 BLOCKED_INPUT_CATEGORY_NOT_APP_CLIENT_CREDENTIALS 是错误分类，需要更正，不应再让用户重新提供凭据。

证据 paypal-oauth-sanitized.json；仅保存环境、布尔状态、HTTP 状态与有效时长。未保存 token/secret/邮箱/密码，未创建 PayPal 交易、订单或真实收付款。认证不证明正式商户资格或授权捕获退款闭环。官方依据：[PayPal OAuth](https://developer.paypal.com/api/rest/authentication/)。

## 本轮独立验证

- runtime-probes.log：实际 _common 函数、模拟 OS 查询/终止，旧孤儿不被杀、REFUSED 结果可阻断构建、合法监听子进程返回 REUSE。三项旧反例已关闭，未真正停止 OS 进程。
- payment-probes.json：8 项真实 provider/transport 函数探针，fetch 全部为 fixture；只有单独的 OAuth 预检访问过 PayPal。
- product-probes.json：8 项真实商品/组件纯函数探针，没有调用 writer 或数据库。
- typecheck.log：独立运行根 typecheck，退出 0。
- unit-contracts.log：独立运行根 test，退出 0，PayPal 22/22 和商品/组件/边界测试实际执行。测试绿色没有覆盖下面的新反例。
- clean-staging-test.log：复制 422 个 Git 跟踪/待提交自有文件形成独立检出布局；无 runtime env、依赖、缓存或外层文档，35 PASS / 2 FAIL / 1 SKIP，退出 1。不是远端 CI，也不是完整干净安装/构建。
- clean-staging-child-diagnostic.log：单独运行复制脚本到唯一 Review staging，定位上述失败：缺少 Git 未跟踪的 02_demos/medusa-dtc，Get-GitHead 的 Resolve-Path 直接失败。原工程这些演示目录存在不能证明源码检出也存在。

本轮未修改正式源码/现有数据库，未重跑会把故障 fixture 写到正式源码的 test:runtime，也未重复完整构建。探针、fixture 和日志均保留在 Review 目录；部分 fixture 的受控 staging 已由测试自身清理。

## 验收状态

| 内容 | 结论 |
|---|---|
| RT-02/03 本批核心修复 | PASS，旧三反例已独立复验；超时/测试覆盖余项并入下一批 |
| RT-01 本机防护 | 保留此前 PASS；检出可移植性另行 RETURN |
| 本机类型与单元/契约入口 | PASS；整体 CI/故障注入仍 RETURN |
| 商品私有 metadata 不再由 writer 新增，首个既有商品清理 | 部分有效；不是全 Store API allowlist，不能整体关闭 PD-01 |
| options 缺失、第二变体价格读回、hard_fail=YES | 修复有效；并不覆盖完整 PD-02～07 |
| 加购恢复、cart 404 与服务失败区分、订单/账户 no-store、GET 转移改显式 POST、注册邮箱匹配 | 代码修复有效；完整失败路径/登录撤权运行矩阵未交付 |
| 邮箱只读、区域缓存、支付失败恢复、付款时间 | RETURN / 未完成，见下文 |
| PAY-02 不同 order 拒绝、PAY-03 必需金额证据 | PASS（本地契约） |
| 同操作退款使用新 data 重放 | PASS（局部）；并发/持久恢复未关闭 PAY-04 |
| PayPal transport、事件持久化、技术运费写入边界 | RETURN，启用支付前必须补齐 |
| PayPal OAuth | Reviewer 实际认证 PASS，解除错误外部阻塞 |

## R1 / P1：真实沙箱 transport 的请求与资金状态不可信

位置：应用 apps/backend/src/modules/paypal/transport.ts 的 request/createOrder/updateOrder/refundCapture/paymentEvidence；service.ts 的 statusFromPayPal/getPaymentStatus。

独立探针确认：

1. createOrder 的 JSON 请求最终 Content-Type 为 text/plain;charset=UTF-8。create/PATCH/refund 未设置 application/json；OAuth 表单头不能复用到业务 JSON。
2. HTTP 400 本应不重试，却被 catch 再试，实际业务请求 3 次。需要可分类异常、有限退避和令牌失效策略，不要把所有异常都循环重发。明确 redirect 策略。
3. retrieve 丢弃 capture/authorization 资源自身状态，只保留 ID。模拟 order.status=COMPLETED、capture.status=PENDING，最终 provider 返回 captured。存在 ID 不代表资金已捕获；VOIDED/DENIED/REFUNDED 等同样不能由顶层 order 状态覆盖。依据真实资源状态与关联 ID 确认资金资格。

现有 22 个 provider 测试并未测试以上 transport 语义。参考 [PayPal Orders API](https://developer.paypal.com/api/orders/v2)，下一批需加入实际 JSON HTTP fixture 和沙箱反例，不能让 mock 一律返回成功。

## R2 / P1：退款并发、负面事件与持久恢复没有完成

service.ts refundPayment 新增 data.refund_operations，修复了新 data 单操作重放；但两项并发部分退款从同一输入各返回 refunded_amount=5.00，无法凭两个输出证明最终累计 10.00。该探针仅证实 provider 自身不是并发协调点，未声称数据库已丢账。需要证明 Medusa 原生持久记录/锁/操作去重的完整行为，不能再以相同单操作测试关闭并发要求。

mapPayPalWebhookAction 基本未改：没有 event/resource/order ID 也仍返回 captured。已有 transport 验签是必要条件，但不提供本地 session/订单/资源/金额/商户环境绑定，也没有新持久事件收件、负面事件处理/重试/对账实现。缺代码与缺 DB fixture 都不是“缺 OAuth 凭据”。修复后在独占数据库断言重放、乱序、pending、失败、退款、重启与发货资格，而非只断言 mapper 字符串。

## R3 / P1：商品正式库存与发布校验仍有未关闭问题

位置：05_product/scripts/product-pipeline.mjs:buildMedusaPlan/validateRecord；medusa-product-upsert.mjs:buildPayload/updatePayload/assertProductReadback。

- 两个 mapper 仍仅在 preview 输出 manage_inventory=false，正式模式省略该字段。对既有 false 变体更新时未恢复原生库存管理；新增 project_owned_inventory != UNKNOWN 的字符串检查不能代替库存位置/数量与模式迁移。
- dry-run/write 仍是两套 mapper，独立输出的 metadata 不同；任务要求共享实际映射没有落实。
- 无效主图 URL 与 TEST_FIXTURE_ONLY record_type 仍同时得到 IMPORT_REQUIRED=PASS、PUBLISH_REQUIRED=PASS。options 缺失现在能阻断，是有效修复，但不能覆盖其他语义漏洞。
- all-variant 测试只检查数量/SKU 非空，不证明所有价格、库存与状态正确；真实单变体同 ID upsert 也不能证明多变体迁移。

要求明确客户模式/本地预览的发布边界；未知库存或履约依旧拒绝正式可售。实际 product ID、$14.99、原图保留，不重新选品。

## R4 / P1：组件已核实事实仍被强制判为“捏造”，失败样品仍可降级为待测

位置：05_product/sourcing/scripts/component-pipeline.mjs:252-280。

noInventedFields 要求 fto_status.value 和 compliance_status.value 都不能是 VERIFIED，依旧让带证据的已核实事实无法通过。独立设置合法 VERIFIED 状态，NO_INVENTED_FIELDS=FAIL；需要校验证据而不是禁止该状态。

sample.test_status=FAIL、hard_fail=NO、decision=NOT_TESTED 时仍得 SAMPLE_GATE=NEEDS_TEST / PROCUREMENT_GATE=HOLD。应明确矛盾状态拒绝，失败事实不能因为另一字段未更新而消失。hard_fail=YES→REJECT 已正确，保留。

## R5 / P1：公开数据及技术 checkout 边界只做了部分入口

apps/backend/src/api/middlewares.ts 没有商品 API 响应投影；公开 metadata 约束在 writer 和 storefront serializer。清理一个现有商品能解决该记录的旧数据，却不能支撑“所有 Store API 都 allowlisted”的声明。下一批必须给出直接 Store API 及嵌套商品/variant 序列化的反例证据，明确私有字段在何层永远被隔离。

技术支付 POST 创建 session 已有后端 403，保留。技术 shipping 目前只是 GET 列表过滤，没有拒绝直接 POST 选择已知技术 shipping option；既有技术支付 session 切入 customer 模式后 complete 的路径也未校验。用隔离实例验证这些写入口；不能以列表看不见代替写入拒绝。不要依赖运费名称的黑名单判断正式资格，因为合法 Standard Shipping 也可能被误挡。

## R6 / P1/P2：客户侧仍有明确遗漏，HTTP 200 回归不能证明它们已完成

- SF-04：payment-return 的 payment_failed/order_failed/payment_retry 仍无读取者；placeOrder 仅新增 await removeCartId，尚无完整 processing/付款证据已存在但订单失败的恢复流程。优先接入既定 PayPal 共享状态，不新建 Stripe 项目。
- SF-02：region Map 加了一小时 TTL，但底层 listRegions/retrieveRegion 仍 force-cache 且无 TTL，刷新 Map 可再次拿到永久旧数据。给真实数据读取同样明确的新鲜度。
- SF-09：状态 captured 但缺 captured_at 时仍回退 payment.created_at 显示 paid at；缺状态也统一显示已授权。两种都不能代表真实事实。没有时间应明确未知，没有授权证据不能称已授权。
- SF-01：假成功已移除，但 ProfileEmail 继续复用固定带 Edit/Save 按钮的 AccountInfo；现在不在 form 中却仍呈现保存操作。按原要求只读显示即可，不开发邮箱迁移。
- SF-03/05/08/10/14 有价值的局部修复应保留；还需覆盖失败注入、账户切换、GET 无写操作等真实行为测试。现有日志只有成功 PDP/cart，不是这些测试的替代。

## R7 / P1：干净 CI 是可以本机证明的代码问题，不应只列外部阻塞

独立复制检出安全测试失败 35/2/1，定位 02_demos/medusa-dtc 不存在。该目录未由源 Git 跟踪；打包脚本无条件读取两个演示仓库。测试应构建独占、完整的最小 fixture 或让可选 demo 缺失被明确处理，不能依赖用户文档/演示文件。创建父目录 00_HANDOFF.md 的临时补丁没有解决完整检出契约。

故障注入仍写固定的 storefront/src/__rt04_injected_type_error.ts 然后删除；仍只断言子命令非零，未证明同一顶层 verify 因指定故障阻断。Invoke-CapturedPnpm 顺序同步读取 stdout/stderr 有缓冲区堵塞可能。test:runtime 已纳入 verify，因此这些测试缺陷现在也进入日常入口。修为隔离/唯一文件、真实诊断和明确门槛，避免递归调用 verify 自己；相关 cleanup 仍须独立绝对路径边界验证。

远端 CI 未执行应诚实记录，但本地源码检出测试无需远端授权或新凭据。下一批在本机先把它跑通。

## 执行范围校准

执行报告承认更新了用户现有商品 metadata 并创建本地 QA carts。本批原任务要求数据库测试只在独占实例，对现有商品仅生成修复预览。这部分执行越过了任务边界。记录实际改动和理由即可，Reviewer 不自动回滚，以免破坏现有进展；随后不再把现有库当测试 fixture，不能因为“没有创建订单”就声称无数据变更。

## 下一步

BATCH-03 = 上述未关闭代码/CI问题＋沙箱纵向订单/授权/捕获/退款与事件联测＋最小可追踪履约准备。OAuth 已成功，不再索要同一份 App 凭据。允许在单批内部按依赖继续；资金状态/事件安全未验证前不开放客户支付或自动发货。真实生产部署、真实收费及真实履约仍需生产条件和相应授权。