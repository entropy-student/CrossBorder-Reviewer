# BATCH-04 独立复审：Inventory / Catalog Boundary / Storefront

`REVIEW_SCOPE=INVENTORY_CATALOG_STOREFRONT`

`DECISION=RETURN`

`MAIN_PROJECT_MODIFIED=NO`

## 结论

BATCH-04 在本范围内完成了若干有效修复：真实 builder 已输出统一的 `pawfectly_*` metadata；纯 inventory plan 会拒绝缺失 location、quantity 或 inventory item；商品与 variant 的投影函数单测通过；支付失败提示已有 URL reader 和 live-region；移动端 CSS 在 767px 以下确实将 checkout summary 改为纵向；生产图片优化不再全局关闭。

但库存写入仍不是可重跑的原生 upsert，客户可达 Store API 响应的 metadata 防线也没有完整覆盖。新增 CSP 会阻断当前 Stripe.js 加载。浏览器级键盘、读屏、320px 和 200% zoom 没有证据。因此本范围不能 PASS。

## Findings（按严重度）

### [P1] Inventory level 同步始终 POST create，不是 upsert，第二次运行会冲突或重复失败

- `05_product/scripts/medusa-inventory-plan.mjs:44-52` 对任何 plan 都固定生成 `POST /admin/inventory-items/:id/location-levels`。
- `05_product/scripts/medusa-product-upsert.mjs:281-290` 没有先查 location level，也没有在已存在时调用 update endpoint；异常也不会按“相同 quantity 已达成”处理。
- `05_product/scripts/medusa-product-upsert.mjs:362` 随后仍输出 `UPSERT_IDEMPOTENCE=PASS`，但这个断言只检查 product 数量与 SKU，不检查 inventory level 重跑。
- 官方 API 分开定义 create/manage 与 update inventory level，当前实现只覆盖 create 路径：<https://docs.medusajs.com/api/admin/inventory-items/update-inventory-level>。

**影响：** 一旦真实商品切到 `PRODUCTION_INVENTORY`，首次可能成功，重跑可能失败；自动化不能安全纠正库存数量。

**建议：** 按 `(inventory_item_id, location_id)` 查询；不存在时 POST create，存在时 POST update 对应 level；随后重复执行两次并验证只有一个 level、第二次可更新 quantity。并发时对唯一冲突重新 read-back 后决定成功或 HOLD。

### [P1] 实际 production inventory 路径未证明能取得 inventory item relation，也没有完整库存 read-back

- `buildInventoryPlan` 在 `medusa-inventory-plan.mjs:18-21` 强制依赖 `variant.inventory_items[0]`。
- 实际写入路径在 `medusa-product-upsert.mjs:338-340` 先以 `fields=*` 读取 product，随后立即把该对象传入 `syncInventoryLevels`。Medusa 的 fields 约定要求显式请求嵌套 relation；文件中稍后的 read-back 才使用 `*variants.inventory_items.*`（line 291）。
- `medusa-product-upsert.mjs:291-298` 只验证 `stocked_quantity`，未验证任务要求的 `reserved_quantity`、`available_quantity`，也未验证 stock location 与 storefront sales channel 的关系。
- 测试 `medusa-inventory-plan.test.mjs:4-35` 是手写纯对象，仅验证 request shape；没有覆盖 create、rerun、quantity update、relation 查询或并发冲突。

**影响：** 当前 `LOCAL_CONTRACT_PASS` 只能证明 plan 形状，不能证明生产库存写入可执行、可售数量正确或结账会从该 location 扣减。

**建议：** 在隔离 Medusa DB 中运行一次完整 production fixture：显式读取/创建 variant inventory item/link，验证 location 与 sales channel；连续两次同步并更新 quantity；通过 Admin API、Store API 与数据库核对 stocked/reserved/available。

### [P1] Metadata 投影只挂在少数 GET 路由，Store API 仍有旁路

- 投影函数 `apps/backend/src/api/public-catalog.ts:40-68` 能正确清洗 `product` / `variant` 嵌套对象；独立运行对应 Jest 为 3/3 PASS。
- 但 `apps/backend/src/api/middlewares.ts:139-160` 只覆盖：
  - `GET /store/products`
  - `GET /store/products/:id`
  - `GET /store/carts/:id`
  - `GET /store/orders/:id`
- Storefront 自身会调用 `POST /store/carts`、cart update、line-item create/update/delete、shipping/payment mutation、cart complete，以及 `GET /store/orders`；例如 `src/lib/data/cart.ts:71-85,104-256,411-418` 和 `src/lib/data/orders.ts:37-49`。这些响应没有挂投影 middleware。
- BATCH-04 要求“直接 Store API 也不能看到 supplier、cost、procurement、risk、HS evidence、内部 operation 字段”，因此仅在 Server Component 再投影不能关闭这个缺口。

**影响：** 持有 publishable key 的浏览器客户可通过未覆盖的 Store API 路径读取 line item 中嵌套 product/variant 私有 metadata。

**建议：** 建立 Store API route matrix，对所有返回 product/variant 的 cart/order/line-item GET 与 mutation 响应统一应用投影；至少覆盖 `/store/orders` 与所有 cart 响应。新增 HTTP 集成测试，对每条路径注入 supplier/cost/HS/internal key 并断言响应中不存在。不要只测试纯 projection 函数。

### [P1] 新 CSP 未允许 Stripe.js 的 script origin，会使现有 Stripe Elements 在生产失效

- `apps/storefront/next.config.js:53` 的 `script-src` 只有 `'self' 'unsafe-inline' 'unsafe-eval'`。
- Storefront 仍使用 `@stripe/react-stripe-js` 与 Stripe Elements（`payment-button/index.tsx:12,89-129`）。Stripe.js 从 `https://js.stripe.com` 加载；当前 `frame-src` 允许它，但 `script-src` 不允许。
- Stripe 官方 CSP 指南要求在 `script-src` 中加入相应 Stripe origin：<https://docs.stripe.com/security/guide>。

**影响：** 如果启用 Stripe，浏览器会被 CSP 拦截，支付组件无法加载。HTTP 200 与 production build 不会发现该问题。

**建议：** 根据实际保留的支付方式生成环境化 CSP，并做浏览器 console/network 验证。若项目确定只保留 PayPal，应同步删除/关闭 Stripe 客户路径与无效 CSP 项，避免假支持。生产 CSP 应去掉没有运行时证据支持的 `unsafe-eval`。

### [P2] “真实 builder → backend allowlist” 没有端到端契约测试

- `medusa-product-payload.mjs:1-17` 的真实 builder 输出多项 `pawfectly_*` public metadata。
- `public-catalog.unit.spec.ts:5-56` 仍手写一套响应 fixture；`product-boundary.test.mjs:10-16` 只检查 builder 自身，没有把其输出交给后端投影。

**影响：** 两端键名再次漂移时，两组测试仍可能各自通过。

**建议：** 让 backend contract 直接消费实际 builder 的 fixture/output，明确最终客户可见键集合。当前两项关键键 `pawfectly_availability_mode`、`pawfectly_selling_price_status` 已对齐，此项是测试缺口，不是当前数据泄漏证据。

### [P2] 浏览器级 a11y / 响应式验收仍缺失；主商品图片替代文本过于泛化

- `ErrorMessage` 已有 `role="alert" aria-live="polite"`，cart/payment retry 提示已有 reader，这部分静态 PASS。
- `globals.css:2915,3046-3056` 在 767px 以下把 address/payment summary 改成纵向，静态规则合理。
- `image-gallery/index.tsx:39-45` 主商品图仍固定 `alt="Product"`，没有使用已确认的商品名称/asset alt。
- 本次复审时 `127.0.0.1:9000` 与 `:8000` 均未运行；无法产生真实键盘、读屏、320px、200% zoom、CSP console/network 证据。Executor 也明确报告未执行这些浏览器检查。

**建议：** 不改冻结视觉，只把 gallery 传入 product title/approved alt；启动隔离环境后完成 checkout/PDP 的键盘顺序、焦点可见、读屏错误播报、320px 与 200% zoom 无水平丢失验证。

### [P2] R2 尚未形成可用的 Next Image allowlist

- `next.config.js:22` 已改成仅开发环境 `unoptimized=true`，当前本地 `/assets/products/COMP-001-main-square.png` 可由生产 Image Optimization 处理，此项 PASS。
- 用户已选择 Cloudflare R2；`next.config.js:23-45` 目前只允许 localhost、S3 和可选 `MEDUSA_CLOUD_S3_*`。未来一旦商品资产切到 R2/custom domain，未配置精确 `remotePatterns` 会导致 Next Image 拒绝。

**建议：** R2 public/custom asset hostname 确定后，通过专用环境变量加入精确 HTTPS hostname/pathname，并用真实方图做生产浏览器验证；当前不应猜测 R2 bucket URL。

## PASS / RETURN matrix

| 子项 | 结论 | 说明 |
|---|---|---|
| builder metadata key 对齐 | PASS | 两个 BATCH-03 漂移键已统一为 `pawfectly_*` |
| projection 纯函数 | PASS | 独立 Jest 3/3 PASS |
| 所有客户可达 API metadata 边界 | RETURN | cart mutations、orders list 等未覆盖 |
| inventory plan fail-closed | PASS | 独立纯测试 PASS |
| inventory native upsert / rerun / concurrency | RETURN | 仅固定 POST create，无真实集成证明 |
| inventory stocked/reserved/available read-back | RETURN | 只读 stocked，未证明 sales-channel 可售关系 |
| recovery message / aria live-region | PASS（静态） | reader 与 alert 已存在 |
| 320px / 200% zoom / keyboard / screen reader | RETURN | 无浏览器证据 |
| production image optimization | PASS（当前本地资产） | production 不再全局 unoptimized |
| Cloudflare R2 image readiness | HOLD | 缺真实 asset hostname，暂不应猜配置 |
| production CSP | RETURN | 当前规则阻断 Stripe.js；未做浏览器 network 验证 |

## 独立验证

- Backend public-catalog unit：3/3 PASS。
- Inventory plan unit：PASS；第一次 reviewer harness 使用了错误相对路径而失败，随后以绝对路径重跑 PASS。该次 harness 失败不是项目测试失败，原始记录保留在 `verification.log`。
- Storefront TypeScript：PASS。
- 本地 HTTP probe：backend/storefront 均未运行，因此没有重复使用 Executor 的 HTTP 200 作为浏览器验收。
- 复审没有修改主项目、商品、数据库、订单、支付或运行时。

证据：[verification.log](C:/Users/34707/Documents/ChatGPT/跨境电商-review/reviewer/BATCH-04/agent-inventory-ui/verification.log)

## 不应修改

- 不重新设计已冻结的 Medusa/Figma/Web UI 和品牌视觉。
- 不改变当前商品、SKU、价格、主图或重新选品。
- 在自有库存/直发责任、location、数量和履约关系未确认前，不把真实商品切换为 `PRODUCTION_INVENTORY`。
- 在 R2 实际 public/custom hostname 未确定前，不添加猜测性的 wildcard 图片域名。

