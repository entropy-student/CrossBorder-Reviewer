# 商品、供应链与数据契约审查

审查日期：2026-09-05。源码根 `S/`=`C:/Users/34707/Documents/ChatGPT/跨境电商/CrossBorder-Independent-Store/`。重点为 `05_product` 的真实 JSON、两个商品映射器、校验器、组件/BOM和样品协议。原项目无修改；独立探针仅在 review 目录加载原源码纯函数，不执行 CLI 写入、网络或数据库操作。

## 当前事实与判断

唯一已整合商品为 pet-hair-remover / PAW-PHR-001 / USD 14.99。商品 JSON 标记 local preview、供应商库存声明 AVAILABLE、项目库存 UNKNOWN、无真实物流；其来源、样品、采购风险保留未核实标签。这个边界合理：可以先预览商品，但不能把 `PUBLISHED` 或 `PUBLISH_REQUIRED=PASS` 读作可发货/可收真实款。

独立执行原 24 项商品自测、21 项组件自测全部通过；再执行 13 项不同输入/状态转换探针，仍找到了下面的问题。既有 PASS 在很大程度上证明固定 COMP-001 样例没有被误改，未证明校验器能支持下一阶段。

## PD-01 · P1（公网前）· 供应商、成本和采购信息进入可公开 product.metadata

- 证据：`05_product/scripts/medusa-product-upsert.mjs:137-161` 将整个 record.metadata 展开并写入 supplier_url、cost_price、采购/物流 gates、bulk_shipping_quote 等；variant metadata 同样写成本。`03_template/medusa-crossborder-base/apps/storefront/src/lib/data/products.ts:77-80` 显式请求 `+metadata`；`src/modules/products/templates/index.tsx:68-70` 将完整 product 交给 `use client` 的 ProductActions，构成另一条浏览器序列化数据路径。
- 已核验框架契约：Medusa [v2.19.0 Store products query config](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/store/products/query-config.ts) 和 [disallowed fields](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/store/utils/disallowed-fields.ts) 不把 product metadata 列为私有禁止字段。不要把 Admin 写入字段误当成 Admin-only 数据。
- 触发：公开 Store API 后，使用公开 publishable key 请求产品 metadata；前端仅“不显示成本”无法防止这一读取。
- 影响：采购价、供应商链接、内部报价与审批状态成为外部可读商业信息。不是密码/API secret 泄漏，本次未连接运行服务获取真实响应；属于自有映射与对应框架字段能力确认的公开面风险。
- 建议：前台 metadata 使用明确公开白名单；成本/供应商合同/内部 gates 留在受控 Product Master 或受 Admin 授权保护的私有数据模型。不要只在 JSX 隐藏字段，也不要为一个 SKU 引入大型 PIM。已写过的敏感 metadata 需迁移/删除并清理缓存。
- 验收：匿名 Store API、fields扩展、商品页 HTML/RSC 中均不含这些内部 key；运营仍可从授权界面查来源。

## PD-02 · P1（库存启用前）· 预览转正式库存后仍可能无限可售

- 证据：`medusa-product-upsert.mjs:163-173` 只在 preview 时设置 `manage_inventory:false`，其他模式不设置；`:249-267` updatePayload 会复用既有 variant ID。真实 inventory_quantity 仅存在 metadata，没有 inventory item/location/level 写入。
- 独立探针：把 master 改为 PRODUCTION_INVENTORY、IN_STOCK、数量10，对既有 manage_inventory=false variant 构造 update；IMPORT/PUBLISH仍 PASS，payload 没有 manage_inventory 字段和库存 level 更新（`product-independent-probes.json` 对应条目）。
- 影响：操作员只修改 master 和重跑导入，原 variant 的 false 状态没有被恢复，数量10只是注释性 metadata，后端可能继续按不管理库存销售。该 writer 本身限于本地；这意味着它不能直接被提升为生产库存迁移工具。
- 建议：明确区分“本地预览 writer”和“生产准入/库存初始化”；模式切换要求显式 manage_inventory=true、inventory link、指定 stock location 和实际数量，并 readback；正式数量未知应保持不可售。
- 验收：preview→production→售罄→补货，各阶段 Store API真实可购数量、reservation和库存回读一致；模拟最后一件并发结账。保留当前预览模式，但不要将预览库存参数随数据库带上生产。

## PD-03 · P2 · 审批的 dry-run 与实际写入不是同一个 payload

- 证据：`product-pipeline.mjs:561-640` 的 buildMedusaPlan 与 `medusa-product-upsert.mjs:133-199` 的 buildPayload 独立实现。dry-run 包含 weight/physical/operations/taxonomy/HS/provenance metadata；实际写入缺少这9类映射，反而展开全部原始 metadata。option_names 推导、资产顺序也不同。
- 复现：`DRY_RUN_VS_ACTUAL_PAYLOAD` 输出两份 metadata key 差集。import guide 描绘 validate→normalize→review plan→write 顺序，实际 writer 重新读原 record，不消费已审查 plan。
- 影响：审批者审核的内容与提交内容不同，日后补物流/分类资料可能以为已导入却没有。物理事实即使在 metadata，也不会自动成为 Medusa native weight/hs_code/分类/库存规则。
- 建议：抽出一份纯映射函数，让 dry-run、write、readback 使用相同契约；写前输出精确 payload 摘要/hash。只抽取确实重复的部分，不重建通用ETL框架。明确哪些字段仅留档、哪些必须写 native 字段和关系。
- 验收：对同一 normalized record，dry-run 与 write body 除操作ID外结构相等；映射物理单位/分类关系时另做实际回读测试。

## PD-04 · P2 · readback 只验证第一 variant，PASS 不能覆盖完整商品

- 证据：`medusa-product-upsert.mjs:275-292` 的 assertProductReadback 多处使用 `commerce.variants[0]`，仅检查第一个 SKU/价格/首个选项；Store 和 PostgreSQL readback 同样以第一个 SKU为主。
- 复现：构造第二 variant 预期99、实际返回1，assertProductReadback 仍成功。没有写入数据库。
- 影响：增加真实颜色/SKU后，错误价格、缺 variant、多余 variant、选项变更可能仍输出 PASS；updatePayload 还直接丢掉 product options，仅复用SKU，不能假设结构变化已得到支持。
- 建议：按 SKU 比较整个预期集合，验证所有 options/prices/inventory模式/图片；新增、删除、改SKU/选项分别定义支持策略，不支持就写前拒绝。多个产品并发导入需后端唯一身份和并发控制，当前先扫描再创建的检查只证明顺序重跑。
- 验收：两个不同价variant、第二variant丢失/错价/重复、多维options、改SKU及重复执行均有完整断言；不要仅看商品总数没变。

## PD-05 · P2 · 商品 gate 漏掉关键语义约束

独立从当前真实 master 变异，以下仍 IMPORT/PUBLISH PASS（物流继续 NEEDS_VERIFICATION）：

| 变异 | 源码原因 | 应有规则 |
|---|---|---|
| Variant选项空对象、两个SKU相同options组合 | `product-pipeline.mjs:448-458` 检查SKU/价格，没有options完整性和组合唯一性 | options键匹配option_names，每组合唯一 |
| inventory_quantity=-1.5 | :113-121/237 仅有限数，未约束整数/非负 | 件数需非负整数；未知保留null |
| main_image.url=`not-a-valid-image-url` | :462-464 仅检查内容/VERIFIED/example.invalid | 允许受控站内绝对路径或合法HTTP(S)资产URL，校验文件/资源存在 |
| record_type=TEST_FIXTURE_ONLY而status=PUBLISHED | :472 只检查record_status | 测试数据类型和状态不可通过发布，跨字段一致性校验 |

这些是校验/发布门槛的缺口，不能宣称每一个异常都一定穿过 Medusa 最终 API（后端可能拒绝）。关键是不要向操作者给出假 PASS，尤其 writer 还会硬编码 approved_by_user=YES。审批是会话/操作事实，不应由适配器替任意输入制造。

建议让 JSON Schema 负责形状，让少量业务函数负责跨字段规则；不要继续手工维护两份“完全等价”的类型检查。短期可保留无依赖实现，但必须做与Schema的差异测试。组件 schema 中 money_fact/measurement 的status和额外属性规则就与通用checkFact存在差异，文档不宜承诺未经验证的等价。

## PD-06 · P1（下一轮样品/供应商核验前）· 组件校验器阻止未知事实变成已知事实

- 证据：`05_product/sourcing/scripts/component-pipeline.mjs:247-254,276-292` 把 supplier_name必须UNKNOWN、包装必须UNKNOWN、dropship必须未知、HS/FTO不得verified作为通用checks，任一失败→BLOCKED；不是只在fixture测试里这样断言。
- 复现：仅把 supplier_name 从 UNKNOWN 改成一个测试供应商名，schema_valid仍true，但 NO_INVENTED_FIELDS=FAIL，整体BLOCKED。
- 影响：下一步拿到真实供应商、尺寸、原产地、包装、风险证据后，更新记录反而被工具拒绝；该实现维护的是当前快照，不是真实工作流。BOM validator也固定只允许COMP-001×1、空包装、空sellable_product_id，无法演进到实际套装。
- 建议：把“当前样例尚未知”留在fixture快照测试；通用validator验证新事实是否有来源、证据、审核日期与一致性。若BOM工具仅为历史审计，明确命名/文档限定，暂不把它包装成可扩展管线。
- 验收：UNKNOWN→有供应商声明→有独立证据→VERIFIED每阶段可表达；无证据的自报verified拒绝；历史快照测试仍可保留但不阻止有效新输入。

## PD-07 · P1（依据样品结论决策前）· Hard fail 与采购 gate 没有强制关联

- 证据：`component-pipeline.mjs:268-270` 只看 sample.test_status 是否PASS，采购gate原样取输入，不核对 hard_fail、score、decision、采购批准。`:289` 只把字符串FAIL视作checks失败，HARD_FAIL=YES没有阻止作用。
- 复现：test_status=FAIL、hard_fail=YES、score=0、decision=FAIL→SAMPLE_GATE=NEEDS_TEST，issue_count=0；改test_status=PASS并bulk_order_gate=OPEN，即出现 SAMPLE_GATE=PASS、PROCUREMENT_GATE=OPEN，仍无issue。总体仍NEEDS_VERIFICATION，因为其他物流/风险未知；报告不把它写成整体PASS。
- 对照：现有样品协议 `product/sourcing/testing/PET_HAIR_REMOVER_SAMPLE_TEST_PROTOCOL.md` “Hard-fail rules / Decision and procurement gates” 明确任何hard fail应拒绝采购。协议里REJECT/READY_FOR_SUPPLY_CHAIN_REVIEW与JSON中HOLD/OPEN/BLOCKED也未建立统一转换。
- 影响：使用单个gate做业务决定的人或自动化会看到自相矛盾的允许状态；失败样品被降格为尚待测试。
- 建议：先定义小状态表：hard fail/失败→拒绝，未测/复测→HOLD，无hard fail且测试通过→只允许供应链复核，采购OPEN还要真实物流/风险/报价与人工批准。由事实计算gate，输入gate只能是结果缓存不能是权威。
- 验收：枚举PASS/FAIL/PENDING×hard_fail×decision矛盾组合，所有hard fail不可能OPEN；零/负成本、数量、重量也需范围检查（当前负196g被接受）。

## PD-08 · P1（业务上线缺口）· 单位经济与最后一公里尚未闭环

master写明MOQ100、单件成本1.6、100件DDP海运报价48、China→US个人消费者dropship支持未知。即使机械计算1.6+48/100=2.08，也只是该批量报价下的部分到货成本，不能当作每个客户订单总成本或利润。未实测包装重/尺寸、最后一公里、退货地址、损耗/补发、支付手续费、获客成本、税费承担等。

建议把样品测试、真实发货方式/报价和单位经济调查与PayPal资格验证同步推进。先选定一个明确履约模型（自有库存/3PL/供应商直发），再确定capture/发货时点、运费规则和买家承诺。第一阶段允许人工履约和手工对账，只要每个订单有责任人、可追踪记录、失败补救；不必先建复杂ERP、自动采购、套装库存扣减。

## 应保留的部分

保留 Product Master/Component Master 分离、未知事实显式记录、用户批准原图、独立物流gate、本地writer默认dry-run、不可重置目录/历史订单的边界、稳定SKU/source identity、Medusa货币单位约定。不要把USD14.99改成1499来“统一支付金额”；只在真实API边界按供应商规范转换。当前单产品无需加PIM、数据总线或复杂库存抽象。

## 可重复证据

- `evidence/product-existing-tests.txt`：24项原测试。
- `evidence/component-existing-tests.txt`：21项原测试。
- `evidence/product-independent-probes.mjs`：13项只读纯函数探针；输出在同名JSON。
- 脚本不是建议合入主项目的最终测试套件；它用VM去除原CLI并获取纯函数，适合审查复现。未来正式回归应直接导出纯函数或通过正式CLI/隔离API测试，避免依赖源码切分。
