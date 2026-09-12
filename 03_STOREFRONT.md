# Storefront 独立 Review

审查日期：2026-09-05。审查对象：`C:/Users/34707/Documents/ChatGPT/跨境电商/CrossBorder-Independent-Store/03_template/medusa-crossborder-base/apps/storefront`。下文源码路径均相对此目录，行号以本次工作区为准。

## 范围与结论

从路由、Server Actions、SDK 包装、缓存、购物车、支付、账户、目录、页面文案和依赖声明重新建立理解，没有采用既有 PASS 判断。未修改主项目、未启动构建、未操作数据库、未创建订单或支付，没有逐文件审计 node_modules/.next/.medusa/.runtime 的生成物或第三方实现。主审已读取父目录 `medusa-crossborder-base/AGENTS.md`，其规则与用户只读要求一起适用。结论以静态源码为主，并补做不输出文件的类型检查；下面明确标注需要隔离运行环境验证的风险，不把它们写成已经复现的事故。

总体判断：这是经过较多定制的 Medusa Next.js starter，已具备商品→购物车→地址→运费→Stripe→订单的骨架，技术测试入口默认关闭、支付返回校验也较 starter 完整；但不能据此认为已经可以接待真实买家。最需要补的不是页面重写，而是交易失败恢复、数据新鲜度、真实账户行为及售后落点。若直接上线，用户可能遇到“邮箱更新成功但实际上未更新”“库存失败后按钮一直加载”“支付返回失败但页面没有任何解释”“订单发货/付款状态始终不变”。

优先级：P1=真实客户使用或上线前应修复；P2=可在受控内测期间修复，但明确设上线门槛；P3=小问题或按功能启用顺序处理。本审查没有证据确认跨账户直接越权，不把公开订单/购物车标识的存在直接等同于 IDOR。

## 数据流与架构判断

1. URL 的国家码由 `src/middleware.ts` 和后端 regions 决定；`src/lib/data/regions.ts` 再维护另一份进程内国家→region 映射。
2. 服务端 `sdk` 单例在 `src/lib/config.ts` 创建，每次 fetch 加 locale header；JWT/cart ID 存 HttpOnly cookie，Server Actions 调 Medusa Store API。
3. 页面读取主要走 `force-cache`，失效 tag 按 `_medusa_cache_id` 生成。购物车操作刷新 carts/fulfillment，完成订单刷新 orders；后台修改、webhook、退款、履约与 storefront 缓存之间没有事件桥接。
4. 目录用 metadata 精确等于 `YES` 的标志过滤真实商品；该过滤发生在 Store API 已分页之后。
5. Stripe session 在 Server Action 初始化，浏览器 Payment Element 收集资料并 confirm，浏览器再调用 cart.complete；跳转支付通过 `/api/payment-return` 检查 cart/session/PI/client_secret 关联后再 complete。

这个架构在当前小目录、少支付方式下可以保留。短期不建议改成自建支付状态机或替换 Medusa；应在现有边界上补齐事实来源、失败分支与验证。

## 问题清单

### SF-01 · P1 · 邮箱编辑向用户报告虚假成功【确定】

- 证据：`src/modules/account/components/profile-email/index.tsx:18-28` 中 `updateCustomerEmail` 不使用 formData、不调用服务端，直接返回 `{ success: true, error: null }`。`src/modules/account/components/account-info/index.tsx:85` 据此显示 `Email updated succesfully`。实际页面 `src/app/[countryCode]/(main)/account/@dashboard/profile/page.tsx:37` 挂载了此组件。
- 触发：登录→Profile→Edit Email→输入另一邮箱→Save。
- 影响：用户以为登录/订单通知邮箱已变更；实际账户与认证身份没有改变，后续安全通知、找回或订单联系可能送到旧地址。
- 建议：最小修复是先去掉可编辑和成功反馈，仅显示邮箱；若确需改邮箱，实现新邮箱验证、认证身份与客户记录一致性及失败恢复，不要只更新 customer.email。
- 验证：修改后重新登录、新旧邮箱分别登录、刷新 Profile、检查通知目的地与后端真实数据；必须断言数据变化，不能仅匹配绿色成功文案。

### SF-02 · P1 · 商品、订单、地区缓存没有可靠的新鲜度边界【源码确定，部署表现待验证】

- 证据：`src/lib/data/orders.ts:26,57`、`products.ts:91`、`cart.ts:49`、`customer.ts:65` 全部 `force-cache`，没有 TTL。`cookies.ts:20-54` 只附加当前浏览器 tag。订单 tag 唯一显式失效入口是 `cart.ts:418-419` 下单；`orders.ts:96-111` 转移订单后也没有失效。`regions.ts:35-39` 的进程内 Map 命中后永不重新拉取，甚至绕过 Next tag 失效。middleware 的 Map 每小时“添加”新国家但没有清除已经移除的国家（`src/middleware.ts:50-60`）。
- 触发：同一买家先访问商品/订单；运营后台调整价格、库存、商品批准状态、国家映射，或支付 webhook、发货、退款改变订单；买家刷新页面。
- 影响：显示旧价格/库存和旧支付/履约状态；批准标志撤回后旧商品仍可能可见。地区从旧 region 迁移后进程继续返回旧 region。后端最终校验可能阻止错误成交，但用户体验和订单信息依然失真。
- 建议：订单/账户/结账使用 `no-store` 或明确短 TTL；公共目录可使用共享 tag+有限 TTL，必要时订阅后台事件失效；移除第二份无 TTL 的 region Map，或给它清晰的刷新/清空协议。不要把“浏览器刷新”当作清除 Data Cache。
- 验证：在 `next start` 对同一 cookie 连续请求；后台改变一条记录后验证规定时间内更新。额外测退出登录、换账号、订单转移后旧用户的旧缓存是否仍可读。最后一项是待验证的敏感数据撤权风险，不是已确认跨用户泄漏。
- 依据：[Next.js fetch 缓存 API](https://nextjs.org/docs/app/api-reference/functions/fetch) 明确区分持久 Data Cache 与按时间/按事件重新验证；本项目显式选择 force-cache。

### SF-03 · P1 · 加购失败后永久 loading，没有用户可恢复路径【确定】

- 证据：`src/modules/products/components/product-actions/index.tsx:131-144` 先 `setIsAdding(true)`，随后 await addToCart，只有成功才能执行 `setIsAdding(false)`；`src/lib/data/cart.ts:157` 将错误抛出。桌面和移动按钮共用这个 handler。
- 触发：另一个买家耗尽最后库存、variant 不可售、后端/网络错误。
- 影响：按钮持续 Loading、被禁用，没有本地错误消息；当前页只能刷新恢复。SF-02 的旧库存显示会增加这一失败场景。
- 建议：try/catch/finally，给用户显示可操作错误，最终恢复按钮；库存变化时刷新产品/购物车事实。
- 验证：隔离测试令 createLineItem 返回库存不足和 500，断言错误可见、按钮恢复、重试成功；同时覆盖移动底栏。

### SF-04 · P1 · 支付返回失败与异步 processing 缺乏完整用户恢复【确定缺少分支，真实支付后果待沙箱验证】

- 证据：`src/app/api/payment-return/route.ts:74-75` 对非 failed/succeeded 的 redirect_status 拒绝；`src/modules/checkout/components/payment-button/index.tsx:139-147` 只对 requires_capture/succeeded complete，其他状态只停止加载，无 pending 提示。return route 写入的 `error=payment_failed`、`error=order_failed`、`payment_retry=1` 在整个 `src` 中没有任何读取者；`src/app/[countryCode]/(main)/cart/page.tsx:13` 不接收 searchParams。`cart.ts:406-424` complete 返回 cart 错误分支时直接返回 cart，调用者 `payment-button/index.tsx:71-79` 忽略返回内容。
- 触发：异步支付 processing；银行返回失败；Stripe 已授权但 cart.complete 返回业务错误/网络错误；重复返回已完成购物车。
- 影响：用户被无说明地送回购物车，或仍停留 Place order；不知道钱是否已扣、订单是否存在，容易重复尝试和联系支持。不能仅靠成功跳转录像证明这些分支安全。
- 建议：明确区分支付失败、处理中、支付已确认但订单同步中、下单业务错误；在可恢复页面读取并展示错误码，但不能信任 URL 决定“已付款”。用服务端状态查询/对账恢复订单，展示真实业务错误。异步付款依赖 webhook 确认与幂等协调，不能仅靠客户继续开着网页。
- 验证：Stripe 沙箱覆盖 processing→succeeded、拒付返回、授权成功后 complete 超时/库存失败、重复返回、关闭浏览器后重新访问；核对一张订单/一次付款及明确的页面状态。
- 依据：[Stripe 支付状态更新](https://docs.stripe.com/payments/payment-intents/verifying-status) 明确列出 processing，并要求服务端 webhook 跟踪状态。

### SF-05 · P1 · 邮件转移订单的 accept/decline GET 页面直接执行写操作【确定】

- 证据：`src/app/[countryCode]/(main)/order/[id]/transfer/[token]/accept/page.tsx:13` 在渲染执行 acceptTransferRequest；相邻 `decline/page.tsx:13` 同理。正常的 `.../[token]/page.tsx` 已有点击才调用 action 的 `TransferActions`，因此这些额外 GET 写入口并非必要。
- 触发：持有有效 token 的链接被浏览器访问、邮件安全扫描器预览或抓取；是否需要既有登录取决于后端授权策略，必须联测。
- 影响：读取页面就接受/拒绝转移、消费 token；用户未主动点击确认也可能改变订单归属或阻止合法转移。
- 建议：GET 只显示确认页，显式按钮 POST/Server Action 才修改；保留后端 token/身份核验与幂等处理。若不打算提供订单转移，先统一关闭入口而非保留两套行为。
- 验证：对有效 token 执行 GET/预取必须没有写操作；明确点击后才变更，重复提交和过期 token 有可理解结果。

### SF-06 · P1 · 缺少真实售后/政策落点，订单帮助链接确定 404【确定】

- 证据：`src/modules/order/components/help/index.tsx:12,15` 的 Contact 和 Returns & Exchanges 都指向 `/contact`，App 路由树没有 contact 路由；`src/modules/layout/templates/footer/index.tsx:7-16` 仅品牌与 Shop all。`src/modules/products/components/product-tabs/index.tsx:113-115` 告诉用户下单前查看退货信息，却没有链接或具体信息。
- 触发：买家付款后求助/退换货，或下单前查看配送/退货条件。
- 影响：缺失交易支持闭环，用户无法执行页面要求；不能以“Shipping details at checkout”替代退货、售后联系和商家信息。本项是产品上线检查，不对具体司法辖区法律义务作未经核实判断。
- 建议：先确定真实客服方式、配送目的地/时效、退货与退款操作口径，再提供真实页面/链接；未有业务依据的承诺不要补写。
- 验证：所有帮助/政策链接 HTTP 200，订单页和 checkout 可找到，移动端可访问，信息与实际履约流程一致。

### SF-07 · P2 · 商品目录先截断再审批过滤，100 件以后商品消失【确定算法缺陷】

- 证据：`src/lib/data/products.ts:84-103` fetch `Math.max(100, offset + limit)` 后 metadata 过滤并将过滤后数组长度当总数；`listProductsWithSort` 在同文件 `138-145` 永远只取 limit 100 后本地排序分页。
- 触发 A：前 100 个结果是未批准 seed，第 101 个为真实批准商品→目录空。触发 B：101 个批准商品→目录最多显示 100 个，最后一件永远不可通过该分页访问。默认 created_at 查询还用升序（`src/modules/store/templates/paginated-products.tsx:47-49`），排序“Latest arrivals”应与 UI 实际标签核对。
- 影响：新上架商品被隐藏，搜索/类别 count 错误；当窗口被 seed 占据时甚至当前真实商品也丢失。
- 建议：把可售/已批准边界放进后端查询或专用 sales channel，在数据库侧过滤、排序、分页并返回真实 count。若暂时不能做，受控内测可完整拉取所有页后过滤，但应有上限和迁移计划。
- 验证：构造上述两个 101 件边界和混合批准/未批准目录；验证 count、末页、排序、搜索及具体 handle 页面与目录一致。

### SF-08 · P2 · 支付方式初始化错误不进入错误 UI【确定】

- 证据：`src/modules/checkout/components/payment/index.tsx:56-63` 的 setPaymentMethod 直接 await initiatePaymentSession，无 catch/finally；由 RadioGroup onChange 调用（:166），只有 handleSubmit 有 catch。`payment-wrapper/index.tsx:34-50` 在已有 Stripe session 而缺 public key 时只是返回普通 div，payment container 则持续 skeleton。
- 触发：第一次选择 Stripe 时 session 创建失败；后端启用 Stripe 但前端 build 缺 publishable key。
- 影响：选项显示已选却没有可用输入，Continue 被禁用，错误不显示；运营误认为“支付 provider 已配置”即可使用。
- 建议：选择方法也用明确 pending/error 状态；初始化失败允许重试；缺 key 时展示受控 unavailable，并在启动/部署配置校验中阻止启用不完整的支付组合。
- 验证：mock 初始化 500、缺 key、loadStripe 失败；页面没有未处理 promise rejection/永久 skeleton，重试能恢复。

### SF-09 · P2 · 订单付款展示把“创建 payment”混同于“已付款”【确定】

- 证据：`src/modules/order/components/payment-details/index.tsx:43-51` 对没有 card_last4 的支付显示 `${amount} paid at ${payment.created_at}`，不查看 captured_at、payment_status。授权待捕获也可有 payment。第 13 行 `order.payment_collections?.[0].payments` 对空数组仍会访问 undefined.payments。
- 触发：手动捕获/先授权订单，或任意无 card_last4 的 payment；无 payment collection 的零额/特殊订单可能触发空数组问题，需以后端实际返回验证。
- 影响：尚未 capture 的支付被表达成已付；显示时间也不是付款捕获时间。特殊订单可能使详情页崩溃。
- 建议：根据订单/支付状态明确写 Authorized/Paid/Refunded 等，使用对应事件时间；安全访问空 collection。不要重构整个金额体系。
- 验证：待 capture、已 capture、退款、空 collection 数据各一例，页面文字与后台事实一致。

### SF-10 · P2 · 网络错误伪装成空购物车、未登录或空白结账【确定】

- 证据：`cart.ts:52` retrieveCart 所有错误返回 null；`customer.ts:68` 所有错误返回 null；`fulfillment.ts:36-38` 和 `payment.ts:34-36` 所有错误返回 null；`src/modules/checkout/templates/checkout-form/index.tsx:23-24` 任何方法请求错误都令整个表单消失。`getOrSetCart`（cart.ts:62-80）又把读取失败当作没有 cart 而新建 cart。
- 触发：Medusa 短暂 500/超时，购物车其实仍存在。
- 影响：买家以为购物车丢失/账号退出；加购可能创建新 cart 覆盖旧 cookie；结账只剩 summary 而没有诊断和重试。
- 建议：区分 404/无 cookie、401、暂时服务错误；后两者不应当成资源不存在；在页面保留重试状态及关联日志，记录脱敏 request ID。
- 验证：对每个 API 注入 401/404/500/timeout，逐一断言，不创建意外新 cart，不把故障宣称为空结果。

### SF-11 · P2 · 构建 PASS 不包含类型/lint 门槛【确定】

- 证据：`next.config.js:21-25` 同时 ignoreDuringBuilds/ignoreBuildErrors；package.json 没有 typecheck/test script，build 只有 next build。`../../scripts/build-production.ps1:54-61` 以 BUILD_ID 存在打印 PASS，并未运行 storefront typecheck/lint。
- 影响：例如 transfer 页面仍使用同步 params 类型，与 Next 15 其余路由 Promise params 风格不一致；忽略类型检查掩盖这些遗漏。不能由此断言当前所有类型都失败，但 build PASS 显然不能证明类型正确。
- 建议：先补单独 `tsc --noEmit` 与 lint 执行门槛，再决定是否移除 bypass；PR/生产构建统一调用。不要仅删除 bypass 然后让现有部署突然失败而不修复已知错误。
- 验证：未来故意放入一个类型错误应阻止 CI。本次主审追加运行 `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`，storefront 与 backend 均退出0（空错误输出见 evidence 下的 typecheck 日志）。这证明当前各自 tsconfig 范围内类型检查通过，不能证明CI会调用它或未来build不会忽略错误；没有生成 .next/tsbuildinfo，也未完成lint/全量构建。

### SF-12 · P2 · SEO 配置是未接线的 starter 残留，交易页没有 noindex【确定】

- 证据：`next-sitemap.js:6` 用数组 `+` 得到字符串，不是 exclude 数组；:4 使用 NEXT_PUBLIC_VERCEL_URL，与实际 getBaseURL 的变量不同。package.json 没有 next-sitemap 依赖或 postbuild，public/src/app 未见 sitemap/robots 路由，因此这个配置本身不会产出站点地图。excludedPaths 的 `/checkout`、`/account/*` 也不匹配带国家前缀的实际页面。checkout/order confirmed metadata 没有 robots noindex；PDP metadata 没有 canonical、JSON-LD，多个 v_id 可形成重复 URL。
- 影响：不能将“有 next-sitemap.js 文件”当作已配置 SEO；敏感交易 URL 缺少显式索引限制。noindex 并非访问控制，本报告没有据此断言数据可被爬虫读取。
- 建议：用 Next 原生 sitemap/robots 即可，不必增加依赖；站点绝对 URL 来源统一；交易/账户/验证/token 页面 noindex；真实 PDP canonical 与商品结构化数据后续补齐。
- 验证：生产域 sitemap.xml/robots.txt HTTP 和内容检查；国家前缀、分页、variant、账户/订单路径单测；查看页面实际 meta。

### SF-13 · P2 · 通用 Input label 未关联，隐藏账户表单仍可被键盘进入【确定源码缺陷，交互实测待补】

- 证据：`src/modules/common/components/input/index.tsx:42-54` input 只有 name，label 使用 htmlFor=name，但没有默认 id。调用方如 profile-email 未传 id。鼠标 onClick 手动 focus 不能替代可访问名称。:60-66 的密码显示按钮没有 aria-label。`account-info/index.tsx:110-118` 使用 static Disclosure.Panel + max-h-0/opacity-0 隐藏编辑表单，未 hidden/inert/disabled，其 input/Save 仍在 DOM 焦点序列中。移动变体模态关闭按钮 `product-actions/mobile-actions.tsx:199-205` 也只有 X 图标。
- 影响：读屏用户无法可靠识别字段/密码切换；键盘用户可能聚焦看不见的 Save/required 字段，错误恢复困难。
- 建议：Input 生成稳定唯一 id，label 对应；给图标按钮名称；未展开编辑区使用真正隐藏/卸载，避免仅透明化。保留现有 Headless UI/Radix，无需自建组件库。
- 验证：键盘 Tab 从账户页顶部到底部；读屏/axe 检查字段名称、焦点、模态标题和关闭按钮；覆盖同页多个同名字段。

### SF-14 · P2 · 注册暂存 cookie 没有核对邮箱，可能串入另一账号的资料【确定】

- 证据：`src/lib/data/customer.ts:196-204` 读取 PendingCustomer 后把名字/电话直接用于当前登录 email，不比较 `pending.email`；暂存 cookie 活 24 小时（cookies.ts:90-96），只有创建新 customer 成功后删除（customer.ts:218）。
- 触发：同一浏览器先用 A 填注册但未完成，再登录尚无 customer record 的 B（或已有验证身份、需首次创建 customer）。
- 影响：B 客户记录写入 A 的名字/电话；共享设备造成资料串用。不会绕过 B 的密码验证，不应夸大为账户接管。
- 建议：仅当规范化 pending.email 等于当前 email 才使用，切换身份/退出清理暂存；在其他设备完成验证后缺失额外资料可让用户自行补全。
- 验证：A→B、中途失败→重试、不同设备验证，逐一检查客户记录。

### SF-15 · P3 · 其他明确小问题与简化点

- `cart.ts:342` 的 `const cartId = getCartId()` 缺 await，if 判断的是 Promise，永远不拦截缺失 cart；后续 updateCart 仍检查 cookie，所以不是已证实授权绕过。`cart.ts:421` removeCartId 未 await，建议按异步约定等待，避免 cookie 清除时序不明确。
- `customer.ts:318-336` deleteCustomerAddress 把失败转换为对象却丢弃该返回值，调用方 `address-card/edit-address-modal.tsx:58-62` 看不到失败。应传回 typed result 或抛出并显示错误。
- `shipping/index.tsx:305` 使用 calculatedPricesMap[option.id] 真值判断，价格 0 会显示 `-`。应判定 number；可用免费动态运费验证。
- `profile/page.tsx:29-30` 宣称可改密码，但 :41-42 注释掉组件；全 src 无找回密码实现。立即修正文案；若开放长期用户账户，密码重置应作为上线前工作，不能靠未挂载 TODO 组件实现。
- `src/modules/home/templates/homepage.tsx` 仍有空 story image slot、只有一张占位说明的 reviews、newsletter 标题下实际是 Shop all。建议删除未提供价值的区块或明确下一阶段，不要伪造评价/订阅能力。
- `cart.ts:281-324` gift-card/removeDiscount stub 以及 dormant onboarding UI 可在确认无引用后逐步删除。它们不是当前交易阻断点，不应优先做全项目清理。

## 安全边界：确认了什么、没有确认什么

- JWT 和 cart cookie 设置 HttpOnly、SameSite=Lax、生产 Secure；Lax 用于跨站支付 GET 返回是有明确场景理由的，不建议机械改回 Strict。
- `/api/payment-return` 没有仅凭 redirect_status 认定付款成功；它先比较 cart session 的 PI ID/client secret/provider，再交给 Medusa complete，且没有把 Stripe secret 继续传入重定向 URL。这些保护应保留。
- `placeOrder(cartId?)`、`setShippingMethod(cartId)`、`initiatePaymentSession(cart,data)` 接收客户端可控参数，且 storefront 过滤 provider 不等于后端权限。必须由 backend reviewer 联查 Store API/工作流边界。仅看本 frontend 不能证明可跳过后端收费，也不能证明已被可靠限制。
- `retrieveOrder` 并没有前端逐项比对 customer ID；是否按 order ID 访问是 Medusa 的 guest bearer 设计还是违规暴露，应按实际后端与业务策略测试。不要通过随便访问真实订单来做探测。
- 前端默认 technical_test 关闭应保留，但 `checkout-exposure.ts:9-12` 只看环境字符串，并没有代码强制 local-only；是否在生产可配置由部署/后端双门槛决定，应在上线配置检查覆盖。

## 需要补的验证矩阵（不是已有 PASS 的再包装）

| 场景 | 需要断言的事实 |
|---|---|
| 同 cookie 后台改价/库存/批准标记/region | 实际 SSR 读取在限定时间更新；不是只刷新浏览器 |
| 加购库存竞争、500、断网 | 错误可读，按钮恢复，不丢原购物车 |
| payment processing、失败、complete 超时 | 清晰 pending/失败/恢复页面；付款/订单最终一致；不重复扣款 |
| 银行返回时已登录/游客、cookie丢失、重复链接 | cart/session绑定正确，完成后可找回对应订单 |
| 邮箱修改、忘密、A注册→B登录 | 后端真实身份和页面状态一致，资料不串用 |
| 订单转移预取/GET/明确点击 | 读取无写入，点击才转移；撤权后缓存不可继续提供敏感旧数据 |
| 101+ 商品混合 seed 与批准 | 分页总数/末页/搜索/排序无漏项 |
| capture/退款/发货 | 用户订单页及时反映真实状态/时间 |
| 纯键盘/读屏 | label与字段匹配，隐藏表单不接焦点，错误和模态可操作 |
| 真实 production build | 类型/lint为硬门槛，政策/帮助/robots/sitemap链接实测 |

当前 storefront 内未见 test/spec 文件，也没有 test script。仓库已有 acceptance/smoke 脚本不代表没有外部测试，但“HTTP成功+品牌关键词”不足以覆盖上述交互和数据变化。建议先补少数高价值端到端用例，优先 SF-01/02/03/04/05，再补目录规模和键盘测试；不用为静态展示组件机械复制实现写单测。

## 建议执行顺序与暂不修改的内容

1. 先堵住会误导用户的行为：邮箱假成功、帮助404、支付无提示/加购卡死、GET转移写入；这是小改动高收益。
2. 定义并实现缓存边界，订单/结账事实先准确；与后台完成 payment→order→fulfillment/退款恢复联测。
3. 将 typecheck/lint 和交易失败测试纳入同一发布门槛；在这之前不把 production build PASS 当上线批准。
4. 补真实客服/政策、账户恢复与索引控制；再处理目录分页、a11y、首页空区块。
5. 商品超过受控小目录前将批准过滤移至后端可分页查询。

暂不修改：Medusa Store API/Next Server Actions 总体分层、国家路由、Stripe Payment Element（避免改为自收集卡号）、默认关闭 PayPal 和 technical fixtures、真实商品批准机制本身、现有视觉风格与字体、还未承诺的订阅/评价/礼品卡能力。应修正这些机制的边界与未完成入口，不做全站重写或重新搭组件库。
