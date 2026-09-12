# 支付与后端独立审查

日期：2026-09-05。源码基准：`C:/Users/34707/Documents/ChatGPT/跨境电商/CrossBorder-Independent-Store`，下文 `T/` 表示其中 `03_template/medusa-crossborder-base/`。所有支付测试均为本地注入 mock；没有真实 API、真实收费、写数据库或启动生产环境。

## 实际完成度

后端 Medusa 2.19.0 负责原生购物车、订单、支付模块。自有 PayPal provider 是约 830 行的适配脚手架，有金额规范化、操作幂等键、返回数据白名单和验签接口；构造器默认使用 `FailClosedPayPalTransport`（`T/apps/backend/src/modules/paypal/service.ts:170,609`），其操作全部拒绝。前端 `checkout-exposure.ts:33` 又将 PayPal 客户入口固定为 false。因此“只填 PayPal key 就能收款”是不成立的。

`06_payment/providers/payment-provider-adapter.mjs` 明确是未接线的参考边界。其测试证明方法拒绝执行，不能证明 Medusa provider 或真实支付成功。WorldFirst 现有资料是收款账户/结算用途，当前项目没有其 checkout transport；这与 PayPal 客户收单是两条不同的数据流，不应混在一个支付状态机里。

已验证的积极部分：PayPal 默认关闭；金额使用十进制文本和 BigInt，USD/EUR 范围明确；不把客户批准当作资金捕获；返回 payment data 使用白名单；传输层保留 webhook headers/raw body；create/authorize/capture/refund 操作键分开。应保留这些设计。

## PAY-01 · P1（公网/真实交易前）· System Payment 的真正边界仍在 UI

- 证据：`T/apps/backend/src/migration-scripts/initial-data-seed.ts:106` 和 `T/scripts/medusa-crossborder-augment.ts:22` 为区域绑定 `pp_system_default`；后者 :45 创建 `enabled_in_store=true` 的测试运费。`T/scripts/medusa-order-smoke.mjs:59-68` 直接通过 Store API 初始化 System Payment 并 complete cart。后端没有自有 middleware/workflow 在客户入口拒绝这些 fixture。
- 触发：将本地 seed/区域/履约数据直接沿用到公网，或只部署前端 customer 模式却开放现有 Store API。
- 影响：客户无需经过隐藏按钮，就可能使用技术支付创建无需真实网关收费的订单；假如后续自动发货仅依据订单创建/系统支付状态，风险进一步放大。并非已经发生了线上盗刷或免费发货；本次未写单，当前默认端口未运行。
- 建议：生产 bootstrap 与本地 seed 分开；生产区域禁止 system provider，移除技术 shipping；在发布前从公开 Store API 验证“尝试技术 provider 被拒绝”，不能只验证页面不显示。限制可售渠道也要落在后端。
- 验收：隔离 staging 直接调用 API，尝试任意 provider ID/历史 fixture；只有正式准入 provider 可初始化并完成订单。保留本地专用技术 fixture，不必删除其测试价值。

## PAY-02 · P1（接入 transport 前）· getPaymentStatus 接受另一 PayPal 订单的状态

- 证据：`service.ts:798-815` 调 retrieveOrder 后不验证 `response.order_id`；同文件 `retrievePayment:768-775` 和 authorize 已做该验证。
- 独立复现：原 session 为 ORDER-A；mock 返回 ORDER-B、CAPTURE-B、相同金额币种，结果却为 captured，返回 data 组合成 ORDER-A + CAPTURE-B。见 `payment-probes.log` 第一项，`payment-probes.cjs` 包含可重复断言。
- 影响：传输映射错误、查询缓存错配或供应商异常结果可能把错误交易证据写入本地支付状态。不是普通客户能直接伪造 PayPal 响应的证据。
- 建议：所有查询/变更结果一致验证订单身份；capture/authorization 的关联身份也由 transport 返回并核对，避免只校验格式。
- 验收：不同订单、不同 capture、缺失 ID、同金额不同交易均拒绝；合法同订单成功。将已存在的 retrieve 校验复用到 status 即可，不需新增框架。

## PAY-03 · P1（接入 transport 前）· 金额验证允许完全没有金额证据

- 证据：`service.ts:372-390` 的 `assertOptionalMoney` 只在 amount 或 currency 至少一个出现时检查，两者都缺失则直接通过；authorize :664、capture :681、refund :730、retrieve :776、status :802 均调用它。
- 复现：mock authorization 仅返回 order/status/authorization_id，无金额币种，仍 authorized。现有 19 项单测虽然验证“金额不匹配拒绝”，没有验证“两项都缺失拒绝”。
- 影响：未来 transport 只取 ID/status，或 PayPal 精简响应未补查询时，会无证据地继承本地金额。对账无法独立证明资金事实。
- 建议：对确认资金结果要求可信金额+币种；如 API 返回精简响应，transport 必须再获取完整资源或明确使用完整响应偏好后核验。不得自行从请求复制金额冒充 provider 证据。
- 验收：缺金额、缺币种、两者都缺、错金额、错币种分别失败；合法完整响应通过。若某步骤确实不提供金额，应明确该步骤不能成为最终资金确认依据。

## PAY-04 · P1（退款启用前）· 同一退款重放会重复累计本地 refunded_amount

- 证据：`service.ts:704-743` 每次把请求额加到 source.refunded_amount，只保存最后一个 refund ID；不检查本次操作是否已记账。
- 复现：首次 5.00 退款成功，使用返回 data 对同一 idempotency_key 再调用；mock 依旧返回同一个 REFUND-A，transport key 也相同，本地累计却从 5.00 变成 10.00。见 `payment-probes.log`。
- 影响：即便供应商保证只退款一次，本地仍可能重复记账并错误阻止后续合法退款；并发两个部分退款也不能用一份 payment.data 累加可靠协调。本项不宣称已造成两次真实退款。
- 建议：以 Medusa 退款记录/稳定 operation ID 和 provider refund ID 做唯一对应与已处理判断，或通过可信退款列表重建累计。避免在 provider 内另造完整资金账本；先明确 Medusa 持久化和重试契约，再补最小幂等边界。
- 验收：同操作重放（旧 data、新 data）、相同金额不同退款、两并发部分退款、远端成功本地超时、退款 pending→completed/failed；本地累计必须等于已成功的唯一退款总额。

## PAY-05 · P1（沙箱事件闭环前）· webhook action 映射不等于资金状态处理完成

- 证据：`service.ts:487-537` 支持 authorization created/voided 与 capture completed/declined，返回 session_id 和金额；voided→canceled、declined→failed。项目没有自有 subscriber/jobs/workflow 补充处理。退款、reverse、争议、pending 事件没有完整处理。
- 已核实关键契约：Medusa **v2.19.0** 的 [payment-webhook subscriber](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/subscribers/payment-webhook.ts#L43) 对 canceled/failed/requires_more/pending 等 action 直接 return。因此即便 mapper 单测“正确返回 failed”，也不代表数据库会同步失败状态或触发运营措施。不是建议修改第三方源码；应在项目扩展点实现明确策略。
- 事件安全缺口：mapper 可以在缺 event ID/resource ID/related order ID 时返回 actionable action；它只取 custom_id/invoice_id 并检查格式，不核对事件与本地 session 的订单、商户、环境、金额币种绑定。`getWebhookActionAndData:819-829` 会先调用验签，当前默认验签拒绝，因此不能把直接调用 mapper 的 mock 说成“能绕过真实签名”。
- 建议：真实 transport 验签后验证事件身份、资源关系和环境；建立持久事件收件记录、去重、重试/失败可见性；将 webhook 和主动查单接入同一事实核验策略。failed/canceled/refunded/reversed/dispute 的处理和人工补救需要明确到负责方与动作。
- 验收：有效签名但错 session/订单/金额/币种/商户环境、同事件重复、乱序、服务重启、退款在 PayPal 后台手动发起、授权作废后再查订单；断言数据库与发货资格变化，不能只断言 mapper 输出。
- 事件范围参照 [PayPal 官方事件清单](https://developer.paypal.com/api/rest/webhooks/event-names/)；是否支持某种账户事件仍需真实账户验证。本审查没有替用户确认 PayPal 账户资格。

## PAY-06 · P1（上线缺口）· 尚无真实可恢复的支付纵向闭环

缺少 OAuth/令牌缓存、超时和可分类重试、真实 Orders/Payments API 映射、用户 approval/return/cancel 流程、签名校验实现、事件持久化与对账、capture 操作时点及责任人、争议/退款运营流程。前端当前是 Stripe 分支骨架，后端没有完成配置的正式客户 provider，不能拿它替代 PayPal 联调。

推进应分两步：先验证商家/市场/沙箱能力；随后只做一个 USD 商品、一种 PayPal checkout 路径的完整纵向闭环，包含授权→订单→捕获→取消/退款→事件恢复。AUTHORIZE 路径必须回答“谁、何时、依据什么捕获/发货，授权过期怎么办”。不必提前做多网关路由，也不应在尚无可靠履约时把授权成功直接视作发货允许。

## 测试证据与局限

- `payment-unit-test-review-config.log`：19/19 既有 provider 单测通过；使用 review 独立 Jest 配置，缓存在 review 目录。
- `payment-probes.log`：4 项独立边界探针确认上述缺陷/接口缺口。脚本加载实际自有 service，transport 全为 mock。
- 项目原始 Jest 配置执行失败：`@medusajs/utils` 未声明为直接依赖且当前解析不到。独立配置通过不能写成“原生测试入口正常”。
- PATH `pnpm` 包装器意外尝试安装后因无 TTY 提前中止；未继续安装，随后直接调用现存测试运行器。主项目源码不作修改；最终文件一致性见总验证报告。
- 未做真实 PayPal、银行、数据库状态机、邮件或发货联测；不作 PCI 合规认证、法律/财税结论或已上线可利用性断言。

## 不建议修改

保留 Medusa Payment Module 作为唯一运行契约；不要把 `06_payment` 参考抽象接成第二套运行支付引擎。保留默认关闭、验签先行、十进制金额、操作幂等键、敏感数据白名单和前端 return 关联核验。当前任务应修复缺失的事实约束和事件闭环，不是重新设计付款 API。
