# RT-01 Execution Report

## Status

`RT-01: READY_FOR_REVIEW`

本次只处理 `92-prepare-review-staging.ps1` 的 staging 目录删除安全。未进入 RT-02/RT-03，未修改业务、支付、数据库、商品、库存、物流、UI、Figma 或 Reviewer 报告。

## 原因分析

原脚本只拒绝 canonical source/document center 本身及其子目录，没有拒绝这些目录的祖先、盘根、用户目录或可信 staging 根本身；对任何已存在的 `StagingPath` 无条件执行递归删除，也没有确认目录由本工具创建并属于当前任务。因而误传项目祖先或无关目录可能造成递归数据破坏。

## 最终行为

- 可信 staging 根由当前源码位置推导为工作区旁的 `_review_stage`，自定义 staging 只能是该根的严格子目录。
- 使用规范化绝对路径、大小写不敏感比较和目录分隔符边界；拒绝 source/document center、它们的祖先、用户主目录、盘根、可信根本身和可信根外的路径。
- staging 路径链和既有 staging 目录树均检查 reparse point；检测到 junction/symlink/reparse point 时在任何递归删除前拒绝。
- 新 staging 创建 ownership marker：`.review-staging.marker.json`。已存在目录必须有与本工具、当前 `PackageId`、当前 source/document-center/staging 身份完全匹配的 marker；缺失、格式错误或身份不符均在删除/复制前拒绝。
- 合法且 marker 匹配的 staging 可受控重跑。打包完成前再次执行路径、marker 和 reparse 检查，然后才清理本次 staging。
- 拒绝错误只说明拒绝原因，不回显 secret 或环境变量值。

## 修改文件

1. `CrossBorder-Independent-Store/04_docs/scripts/92-prepare-review-staging.ps1`
   - 增加路径边界、祖先保护、reparse 检查、ownership marker 校验，以及删除前二次校验。
2. `CrossBorder-Independent-Store/04_docs/scripts/92-prepare-review-staging.security.tests.ps1`
   - 增加本问题的无副作用路径/归属测试和专用测试根受控文件系统测试。

## 测试与证据

命令：

```powershell
& 'C:\Users\34707\Documents\ChatGPT\跨境电商\CrossBorder-Independent-Store\04_docs\scripts\92-prepare-review-staging.security.tests.ps1'
```

退出码：`0`

测试断言：`26`；测试结果：`PASS`。

覆盖并实际断言：

- source root/descendant、document center root/descendant、workspace ancestor、user home、disk root、trusted root、trusted-root 相似前缀、可信根外路径均以非零退出拒绝。
- 大小写与尾分隔符归一化后仍拒绝；路径中的 `..` 不绕过边界。
- 已存在且无 marker 的 staging 被拒绝，哨兵内容保持不变。
- marker 格式/身份不匹配的 staging 被拒绝，哨兵内容保持不变。
- 测试程序自建的可信子目录可创建；匹配 marker 的目录可重跑；旧 owned 文件被受控重跑清理，marker 仍存在。
- junction staging 被拒绝于删除前，junction 指向的外部哨兵内容保持不变。
- canonical source 的 `PROJECT_STATUS.json` 与 document center 的 `00_HANDOFF.md` 内容哈希前后一致。

原始测试输出见同目录 `RAW_TEST_LOG.txt`；实际工作树 diff 见 `ACTUAL_DIFF.patch`。

## 未测试项与限制

- 本次没有用真实项目、项目祖先或无关用户目录执行删除；风险证明只使用拒绝路径和测试程序自建专用测试根。
- junction 测试在当前 Windows 环境已创建并执行，结果为 PASS；未单独创建 symbolic-link（需要额外权限），不把未测的 symbolic-link 单独宣称为 PASS。脚本对所有 `ReparsePoint` 属性统一拒绝。
- 未执行 `-CreateZip` 的完整打包；RT-01 目标是删除安全。任何后续打包验证必须显式传入独立 staging/package/manifest 路径。

## Git 状态与 HEAD

修改前（开始 RT-01）：

- 外层文档仓库：`HEAD=38e879c42ead6e561939a7881526c2a984c158a2`，`CLEAN`
- 源码仓库：`HEAD=4b7dd0f371f13cc3ee1f598499dcecbf63b33fec`，`CLEAN`
- 独立 Review 目录：不是 Git 仓库

修改后（未自动提交）：

- 外层文档仓库：`HEAD=38e879c42ead6e561939a7881526c2a984c158a2`，`CLEAN`，无本次变更
- 源码仓库：`HEAD=4b7dd0f371f13cc3ee1f598499dcecbf63b33fec`，存在且仅存在本次两个工作树变更：1 个 modified staging script、1 个 untracked security test
- 独立 Review 目录：不是 Git 仓库；本报告和证据是交付物，不属于源码仓库

没有覆盖、回退或提交已有变更；本次开始前两个正式仓库均无已有未提交变更。

## 范围外变更

无。未修改 storefront/backend 业务代码、支付配置、数据库、Docker/runtime、冻结 UI/Figma、项目总状态或 Reviewer 报告。

## 剩余风险

`PackagePath`/`PackageManifestPath` 仍属于打包输出参数，后续使用时应继续显式指定到独立 outbox；本次未扩展其文件覆盖策略，因为 RT-01 只关闭 staging 递归删除路径。后续 Reviewer 可独立复查该边界。
