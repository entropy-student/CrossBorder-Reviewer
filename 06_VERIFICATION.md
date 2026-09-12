# 独立验证、证据与边界

## 方法

先从实际文件树、仓库边界、入口配置及源码理解项目，再把现有PASS/合同与实现对照。主审负责商品/供应链、架构、资料整合；支付/店面/运行三个方向同时独立检查。两个方向在完成专题报告前因额度中止，主审接手原始日志、重新读取相关源码并完成报告；没有直接把未核实聊天简报写成确定结论。

已读取当前模板AGENTS和Next.js review技能。主项目仅只读访问，报告/测试辅助文件均写在用户指定的review目录。未为了审查改主项目代码或文档。

## 实際执行的检查

| 检查 | 结果 | 证据 |
|---|---|---|
| 商品原有自测 | 24项PASS | evidence/product-existing-tests.txt |
| 组件/BOM原有自测 | 21项PASS | evidence/component-existing-tests.txt |
| 商品/组件独立反例与映射探针 | 13项观察记录；确认多处既有测试遗漏 | evidence/product-independent-probes.mjs / .json |
| PayPal原有mock单测（独立review配置） | 19/19 PASS | payment-unit-test-review-config.log、payment-jest-review.config.cjs |
| PayPal独立边界探针 | 4项确认 | payment-probes.cjs / .log |
| 原生Jest配置 | 失败，Cannot find module @medusajs/utils | payment-unit-test-direct.log |
| storefront类型检查 | exit 0 | evidence/storefront-typecheck.txt（无错误输出） |
| backend类型检查 | exit 0 | evidence/backend-typecheck.txt（无错误输出） |
| 新锁文件依赖审计，全量与prod | 均4 high / 7 moderate / 0 critical | evidence/dependency-audit/audit-*-current.json |
| 默认本地端口HEAD | 9500/8500均ECONNREFUSED | 本次运行快照；未外推自定义端口 |
| 源码/文档保护 | 起始546个受版本管理、非env文件SHA256快照；结束比对与Git状态单独保存 | evidence/source-baseline.json、source-integrity-result.json |

类型检查直接运行两app已安装的TypeScript入口：`node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`。未输出js/declaration/tsbuildinfo，未构建.next/.medusa。通过范围由当前tsconfig决定（包括skipLibCheck等），不是类型系统完备性或页面集成通过保证。

依赖审计在review/evidence/dependency-audit中只复制当前package/lock/workspace声明，未安装依赖或修改主锁文件。读取现成测试/编译工具运行不等于审计第三方源码；没有对node_modules、.next、.medusa、.runtime进行全量分析。

## 有意义的证据区分

- **源码确定**：如邮箱action直接return success、GET页面调用订单变更、路径guard允许祖先再delete，可由控制流判断，不需对真实用户/真实文件做破坏性演示。
- **独立探针确认**：如订单ID混用、退款重复累计、库存payload缺字段、第二variant错价仍通过。探针只证明函数/适配边界，不冒充真实PayPal或真实DB事故。
- **框架版本核验**：为metadata公开面、Medusa webhook subscriber消费策略，核对官方v2.19.0对应源码；只针对具体问题查看相关上游文件。
- **上线缺口**：真实transport、备份恢复、物流邮件/政策等源码未完成，必须联测。不把“没有源码”自动等同于外部服务一定不存在；本工作区没有可核验的接入/验收证据。
- **未证实风险**：跨账号旧缓存撤权、邮件扫描是否具备认证、公开订单ID访问策略、具体依赖漏洞可达性，需要隔离环境进一步验证，专题报告已标注。

## 明确未执行

没有启动应用或容器、迁移/seed、创建或修改订单/用户、真实支付/退款、发邮件、删除目录/杀进程、修改.env、安装主项目依赖、生产build、外网发布。没有运行会写真实业务状态的acceptance-smoke。没有视觉浏览器复测、完整lint、性能压测、真实沙箱E2E、备份恢复或合规认证。

原测试运行有一次使用宿主pnpm包装器，包装器尝试安装后因无TTY在删除modules前中止；没有继续安装。随后改用直接测试入口和review独立配置，所有相关失败日志保留，未把这次失败隐藏为“原入口PASS”。

## 外部资料的作用

报告中的GitHub/Next/Medusa/PayPal/Stripe链接用于核对框架/协议事实，依赖漏洞按本次锁文件和新audit结果判断。没有访问商家账户，未验证账户资格、资金账户关系、税务/海关结论；供应商未知事实仍未知。历史图片/审核文档只作历史需求与证据索引，未拿其PASS替代本次结果。

## 审查局限

本次“全面”覆盖当前应用自身各关键层、数据工具、配置/依赖、运行脚本和上线工作，不等于每条第三方演示代码逐行审计。02_demos/历史archive侧重角色、配置隔离和是否污染当前流程；没有重新比较平台或审查Spree所有上游代码。546文件hash覆盖外层文档与内层源码两个仓库中选定受控文件，不覆盖被忽略的运行缓存、真实env或其他独立demo Git历史。

报告不能用作“未列出的项目都安全”的声明。它提供具体缺陷、可复现证据、修复顺序与验收标准；下一轮应关闭这些有触发条件的问题，而不是仅更新总状态为PASS。

## 完成时核对

2026-09-05 20:29（Asia/Shanghai）结束比对：546个纳入快照的文件内容全部一致，外层文档仓库和内层源码仓库Git status均为空。源码HEAD为 `4b7dd0f371f13cc3ee1f598499dcecbf63b33fec`，文档HEAD为 `38e879c42ead6e561939a7881526c2a984c158a2`。8份Markdown报告之间的本地链接检查没有断链；问题索引收录42个问题组（含跨专题重叠，不等于42个独立漏洞）。
