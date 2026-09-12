# 全部问题索引

专题中的编号是问题组，部分问题组含多个同源表现。CI、缓存、生产边界的交叉引用不应重复实施；优先级以触发条件和README执行顺序为准。P1包括下一次危险本地操作、开放相关功能前和上线门槛，并不都指当前线上事故。

| ID | 优先级 | 问题 | 专题 |
|---|---|---|---|
| AR-01 | P2 | 证据系统过多，缺少一个可执行的当前状态定义 | [报告](01_ARCHITECTURE_DOCUMENTS.md) |
| AR-02 | P1 | （发布流程）· 两仓库状态与构建证据没有自然原子性 | [报告](01_ARCHITECTURE_DOCUMENTS.md) |
| AR-03 | P1 | （阶段顺序）· 支付作为唯一下一阶段，会晚发现履约和商品可行性问题 | [报告](01_ARCHITECTURE_DOCUMENTS.md) |
| AR-04 | P2 | 软件复杂度已经超过首个SKU的必要范围 | [报告](01_ARCHITECTURE_DOCUMENTS.md) |
| AR-05 | P1 | （上线验收）· 必须验证“钱、货、订单、通知”一致性 | [报告](01_ARCHITECTURE_DOCUMENTS.md) |
| PAY-01 | P1 | （公网/真实交易前）· System Payment 的真正边界仍在 UI | [报告](02_PAYMENT_BACKEND.md) |
| PAY-02 | P1 | （接入 transport 前）· getPaymentStatus 接受另一 PayPal 订单的状态 | [报告](02_PAYMENT_BACKEND.md) |
| PAY-03 | P1 | （接入 transport 前）· 金额验证允许完全没有金额证据 | [报告](02_PAYMENT_BACKEND.md) |
| PAY-04 | P1 | （退款启用前）· 同一退款重放会重复累计本地 refunded_amount | [报告](02_PAYMENT_BACKEND.md) |
| PAY-05 | P1 | （沙箱事件闭环前）· webhook action 映射不等于资金状态处理完成 | [报告](02_PAYMENT_BACKEND.md) |
| PAY-06 | P1 | （上线缺口）· 尚无真实可恢复的支付纵向闭环 | [报告](02_PAYMENT_BACKEND.md) |
| SF-01 | P1 | 邮箱编辑向用户报告虚假成功【确定】 | [报告](03_STOREFRONT.md) |
| SF-02 | P1 | 商品、订单、地区缓存没有可靠的新鲜度边界【源码确定，部署表现待验证】 | [报告](03_STOREFRONT.md) |
| SF-03 | P1 | 加购失败后永久 loading，没有用户可恢复路径【确定】 | [报告](03_STOREFRONT.md) |
| SF-04 | P1 | 支付返回失败与异步 processing 缺乏完整用户恢复【确定缺少分支，真实支付后果待沙箱验证】 | [报告](03_STOREFRONT.md) |
| SF-05 | P1 | 邮件转移订单的 accept/decline GET 页面直接执行写操作【确定】 | [报告](03_STOREFRONT.md) |
| SF-06 | P1 | 缺少真实售后/政策落点，订单帮助链接确定 404【确定】 | [报告](03_STOREFRONT.md) |
| SF-07 | P2 | 商品目录先截断再审批过滤，100 件以后商品消失【确定算法缺陷】 | [报告](03_STOREFRONT.md) |
| SF-08 | P2 | 支付方式初始化错误不进入错误 UI【确定】 | [报告](03_STOREFRONT.md) |
| SF-09 | P2 | 订单付款展示把“创建 payment”混同于“已付款”【确定】 | [报告](03_STOREFRONT.md) |
| SF-10 | P2 | 网络错误伪装成空购物车、未登录或空白结账【确定】 | [报告](03_STOREFRONT.md) |
| SF-11 | P2 | 构建 PASS 不包含类型/lint 门槛【确定】 | [报告](03_STOREFRONT.md) |
| SF-12 | P2 | SEO 配置是未接线的 starter 残留，交易页没有 noindex【确定】 | [报告](03_STOREFRONT.md) |
| SF-13 | P2 | 通用 Input label 未关联，隐藏账户表单仍可被键盘进入【确定源码缺陷，交互实测待补】 | [报告](03_STOREFRONT.md) |
| SF-14 | P2 | 注册暂存 cookie 没有核对邮箱，可能串入另一账号的资料【确定】 | [报告](03_STOREFRONT.md) |
| SF-15 | P3 | 其他明确小问题与简化点 | [报告](03_STOREFRONT.md) |
| RT-01 | P1 | ，立即修复 · Reviewer staging 可递归删除项目祖先或无关目录 | [报告](04_RUNTIME_DEPENDENCIES.md) |
| RT-02 | P1 | ，下一次 build 前 · stale PID 可以杀掉无关进程树 | [报告](04_RUNTIME_DEPENDENCIES.md) |
| RT-03 | P2 | HTTP 200 被当作项目身份，可能复用错误服务 | [报告](04_RUNTIME_DEPENDENCIES.md) |
| RT-04 | P1 | ，下一轮修复开始前 · 测试入口、类型检查和 CI 没有形成硬门槛 | [报告](04_RUNTIME_DEPENDENCIES.md) |
| RT-05 | P1 | （公网前）· 新审计仍有 4 high / 7 moderate，需要按路径处置 | [报告](04_RUNTIME_DEPENDENCIES.md) |
| RT-06 | P2 | Node/Corepack 与环境解析契约不够明确 | [报告](04_RUNTIME_DEPENDENCIES.md) |
| RT-07 | P1 | （上线缺口）· 本地 production-mode 不是生产部署 | [报告](04_RUNTIME_DEPENDENCIES.md) |
| RT-08 | P2 | 本地构建与可重复性需要限定证据含义 | [报告](04_RUNTIME_DEPENDENCIES.md) |
| PD-01 | P1 | （公网前）· 供应商、成本和采购信息进入可公开 product.metadata | [报告](05_PRODUCT_SUPPLY_CHAIN.md) |
| PD-02 | P1 | （库存启用前）· 预览转正式库存后仍可能无限可售 | [报告](05_PRODUCT_SUPPLY_CHAIN.md) |
| PD-03 | P2 | 审批的 dry-run 与实际写入不是同一个 payload | [报告](05_PRODUCT_SUPPLY_CHAIN.md) |
| PD-04 | P2 | readback 只验证第一 variant，PASS 不能覆盖完整商品 | [报告](05_PRODUCT_SUPPLY_CHAIN.md) |
| PD-05 | P2 | 商品 gate 漏掉关键语义约束 | [报告](05_PRODUCT_SUPPLY_CHAIN.md) |
| PD-06 | P1 | （下一轮样品/供应商核验前）· 组件校验器阻止未知事实变成已知事实 | [报告](05_PRODUCT_SUPPLY_CHAIN.md) |
| PD-07 | P1 | （依据样品结论决策前）· Hard fail 与采购 gate 没有强制关联 | [报告](05_PRODUCT_SUPPLY_CHAIN.md) |
| PD-08 | P1 | （业务上线缺口）· 单位经济与最后一公里尚未闭环 | [报告](05_PRODUCT_SUPPLY_CHAIN.md) |

具体触发条件、证据、修复及验收请打开专题。没有将待核实的跨账户漏洞或未配置服务写成已发生事实。
