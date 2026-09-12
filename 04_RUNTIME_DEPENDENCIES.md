# 运行、依赖、安全脚本与发布准备度

日期：2026-09-05。`S/`=`C:/Users/34707/Documents/ChatGPT/跨境电商/CrossBorder-Independent-Store/`；`T/`=`S/03_template/medusa-crossborder-base/`。结论基于自有脚本、配置、锁文件、新隔离依赖审计及保留的测试输出。没有执行删除、reset、setup、build、数据库迁移、启动服务。

## RT-01 · P1，立即修复 · Reviewer staging 可递归删除项目祖先或无关目录

- 位置：`S/04_docs/scripts/92-prepare-review-staging.ps1:33-42,261-263`。
- 缺陷：只禁止 staging 等于项目/文档中心或是它们的子目录，却没有禁止 **祖先**；对任何已存在 staging 无条件 `Directory.Delete(..., true)`，没有专用标记或内容所有权验证。
- 触发示例（不要执行原脚本）：把 StagingPath 指向 `C:/Users/34707/Documents/ChatGPT`，前两项 guard 均不命中，随后将递归删除其下所有内容，包括主项目；其他无关目录也允许。默认 staging 本身较安全，风险来自合法参数误用，且没有要求 CreateZip 才删除。
- 严重度依据：这是本地数据破坏路径，不依赖上线、付款或攻击者；应在下一次使用该打包工具前修。未用真实删除复现。
- 最小修复：默认每次创建唯一 staging；复用时仅允许指定审查根目录的严格子目录，并校验专用 marker。双向检查源/目标祖先关系，拒绝盘根、用户目录、工作区祖先及 reparse point/junction；避免“目录存在就清空”。PackagePath/ManifestPath 同样要避免覆盖任意已有用户文件。
- 验收：纯路径表测试覆盖当前目录/子目录/所有祖先/盘根/大小写/尾分隔符/junction/无marker目录。真正删除测试只在测试程序自建且已核实边界的临时目录内进行。

## RT-02 · P1，下一次 build 前 · stale PID 可以杀掉无关进程树

- 位置：`T/scripts/_common.ps1:225-248`；调用在 `build-production.ps1:23-27`。
- 缺陷：仅从 pid 文件取数字，递归收集该 PID 子进程并强制终止，没有核对程序路径、命令行、启动时间或项目身份。
- 触发：系统重启或进程退出后 PID 被其他应用复用；运行构建会杀掉其他程序及其子进程，可能丢失未保存内容。
- 修复：保存并校验 PID+启动时间+可执行文件及项目命令行；身份不匹配视作 stale 文件，不杀进程。明确 process tree 的归属范围。
- 验收：用无害测试进程模拟匹配/不匹配/已退出/复用；不匹配进程必须保持运行。

## RT-03 · P2 · HTTP 200 被当作项目身份，可能复用错误服务

- 位置：`T/scripts/start-local.ps1:60-73,83-96`；`build-production.ps1:41-45`。
- 触发：目标端口被另一个 Medusa/Next 项目占用，但 `/health` 或 `/us` 也返回 200。脚本直接打印 REUSED=PASS；检查 .env 中数据库端口并不能证明占端口的进程使用这份 .env。
- 影响：错误项目被纳入构建/验收；同样的问题会使上层商品 writer 在认证后才发现目标不一致，而写后 readback 已来不及撤销。
- 修复：监听端口→进程身份核验，服务返回非敏感实例标识与预期项目匹配；检查 Docker 映射/volume 与真实 backend 身份组成完整链。不要以品牌词或 HTTP 200 代替。
- 验收：两个不同项目或简单 200 stub 占端口，启动器拒绝复用；正确实例可复用。

## RT-04 · P1，下一轮修复开始前 · 测试入口、类型检查和 CI 没有形成硬门槛

- 根 package 的 `test=turbo test`，两 app 没有名为 test 的 script；后端只有 test:unit / test:integration:*，因此根 test 不会自动覆盖这些测试。
- `T/apps/backend/jest.config.js:1` require `@medusajs/utils`，但 backend/package.json 未直接声明；本次直接运行原配置得到 Cannot find module（`payment-unit-test-direct.log`）。不能依赖偶然 hoist 的传递依赖。
- 后端 test scripts 使用 `TEST_TYPE=... NODE_OPTIONS=... jest` 的 POSIX 环境赋值语法，对当前 Windows 默认脚本 shell 不便携。
- `T/apps/storefront/next.config.js:21-25` 忽略 lint/type errors；没有独立 typecheck/test script。`build-production.ps1:54-61` 以 build 命令和 BUILD_ID 输出 PASS，不验证类型。
- 唯一当前模板 workflow 位于 `T/.github/workflows/update.yaml`，仅 workflow_dispatch 更新 Medusa；相对于源码 Git 根它还是嵌套目录，不能当作源码根的 PR CI。演示项目 CI 也不能覆盖主模板。
- 修复：源码 Git 根设置最小 verify 入口，明确调用两 app 的类型/lint、支付单测、商品/组件测试和少数关键集成用例；无测试执行必须失败。修正依赖入口和 Windows env 设置。先暴露并修复已有错误再收紧 bypass，不能仅加一个绿色 badge。
- 验收：故意错误测试/类型错误必须让同一个入口失败；本地与干净 CI 执行同一组任务；输出测试数、commit、环境和退出码。
- 补充实测：本次直接调用两 app 已安装的 TypeScript，使用 `--noEmit --incremental false --pretty false`，均退出0。故本项是自动门槛和原生测试入口缺陷，不是宣称当前TypeScript源码编译失败。检查受当前tsconfig（含skipLibCheck等）约束。

## RT-05 · P1（公网前）· 新审计仍有 4 high / 7 moderate，需要按路径处置

证据：`evidence/dependency-audit/audit-prod-current.json` 和 `audit-all-current.json`。只在 review 目录复制声明/锁文件并运行 `corepack pnpm@10.11.1 audit --prod --json` 与全量 audit，没有安装依赖。计数是 advisory 级统计，**不是 11 个已证明可利用的应用漏洞**；生产 audit 仍可能含构建/CLI依赖，因为它们被声明在 dependencies。

| 包/路径 | 当前告警与实际条件 | 处置 |
|---|---|---|
| Next→sharp | libvips 相关 high，恶意图片解码条件；当前 `images.unoptimized=true`，不能推断当前请求必经 sharp | 开启优化/非可信图片前必须升级并验证原生依赖兼容；不要直接强行开优化 |
| Next→postcss | source map 路径读取与字符串化问题；关键是是否处理非可信 CSS/映射 | 隔离构建环境、确认 CSS 输入来源；选兼容修复版本，验证构建与路径约束 |
| backend CLI→graphql-codegen→lodash | template imports/code injection 与原型污染告警；需非可信输入到相应调用 | 沿受影响传递路径更新/验证，不能声称当前 storefront 的普通 lodash get 已可远程执行代码 |
| storefront→qs | isBuffer 与特定参数解析 DoS 告警 | 更新支持范围内补丁，确认自有 query 参数调用和回归 |
| CLI→ajv、event-bus-redis→bullmq→uuid | 分别依赖特定 $data 选项、buffer 调用条件 | 明确生产/构建可达性；避免为了清数字做跨 major 全局 override |

本次查验的公告：[sharp](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)、[lodash](https://github.com/advisories/GHSA-r5fr-rjxr-66jc)、[PostCSS](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)、[qs](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)。完整 11 项 ID、版本范围和依赖路径保留在 JSON 中。

文档纠错：旧 `DEPENDENCY_AUDIT_TRIAGE.md` 把 storefront lodash 写为 4.17.23；本次 lock importer 实为 4.18.1，脆弱旧版在后端传递链。Next 当前声明 15.5.24，不能机械复述旧 Next 漏洞而不核对修复版本。上线前重新生成审计与可达性结论，历史“暂缓”需有复查时间/负责人。

## RT-06 · P2 · Node/Corepack 与环境解析契约不够明确

- root/backend engines 为 `^20.19.0 || >=22.12.0`，缺少精确支持上界和 LTS策略；脚本加载时 `_common.ps1:9` 强制要求 Corepack。当前检查是 Node 24.19.0，可工作；不能据 engines 范围就保证所有更高版本工具链可用。
- `Read-KeyValueFile:32-38` 原样保留 dotenv 引号；同文件 `Get-DotEnvValue` 却会剥引号，存在两套不一致解析。setup 自生成无引号时不触发，用户按常见 dotenv 写法加引号后可能把引号传给进程。
- PATH 中 pnpm 是宿主包装器，本次一次 pnpm exec 尝试触发安装但无TTY中止；项目 runner 用 exact Corepack 是更可靠的路径，应将日常检查命令也统一。
- 建议：明确单个已验证 LTS 与 Corepack 安装步骤；不要以 >= 放任未来 major。保留一套 dotenv 解析/校验，敏感值不回显；命令文档附工具解析路径检查。

## RT-07 · P1（上线缺口）· 本地 production-mode 不是生产部署

`T/docker-compose.local.yml` 只有本地 PostgreSQL，loopback 绑定值得保留。`T/apps/backend/medusa-config.ts:74-88` 只有数据库/HTTP和条件PayPal模块；项目未配置生产事件/工作流持久化、锁、通知、对象存储、独立 worker、部署/回滚、备份恢复或监控。`deployment/README.md` 只是明确 deferred。不能因为 NODE_ENV=production 就认可真实支付可靠性。

部署设计至少需要：选定主机与进程模型；数据库备份/PITR并做恢复演练；持久事件、工作流和锁的方案；密钥分环境、HTTPS/管理面权限；支付回调观测、失败队列与人工补偿；邮件送达；资产持久化；一次代码+迁移兼容的回滚演练。官方 [Medusa 部署指南](https://docs.medusajs.com/learn/deployment/general) 给出相应生产模块配置；不要只设一个 REDIS_URL 便宣称完成，也不必在当前本地原型立即容器化所有服务。

## RT-08 · P2 · 本地构建与可重复性需要限定证据含义

build runner 先停现有服务、移动旧构建到 `.runtime/build-archive` 再 build；这是本地调试操作，不提供无中断发布或自动回滚，也没有归档保留策略。数据库 image 使用浮动 `postgres:16-alpine`，冻结 pnpm lock 不等于所有运行位元完全相同。短期应记录 image digest/工具版本和明确回退操作，真正部署再选不可变 artifact；不建议为了这个问题立即改整套开发环境。

## 运行验证边界

文档默认 `127.0.0.1:9500/health` 与 `127.0.0.1:8500/` 在本次只读 HEAD 探测均 ECONNREFUSED；这只是默认端口快照，不等于所有自定义端口都停机。本次未读取 .runtime 追踪生成状态、未启动服务器，故没有宣称完成页面/订单/DB运行验收。危险脚本只检查源码与纯判断，绝未实际运行删除/杀进程验证。
