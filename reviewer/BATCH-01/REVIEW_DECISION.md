# BATCH-01 独立复审：PARTIAL PASS / RETURN

日期：2026-09-06。最终目标：独立站正常使用并上线。不是整批 PASS，也不推倒已完成工作。返修合并进入 BATCH-02，不再为本批单独交接一轮。

## 验收矩阵

| 项目 | Reviewer 结论 | 边界 |
|---|---|---|
| RT-01/R1 本地 staging 删除保护 | PASS（当前本机范围） | 既有 19 项独立防护探针、主脚本未改变、R1 实际测试代码已改为纯危险路径校验/受控目录/明确原因/独立 SKIP；37 PASS/1 SKIP 是执行方记录，未冒称 Reviewer 重跑数 |
| RT-02 进程停止安全 | RETURN | 初始 PID/命令校验有效，但进程树归属和拒绝后的构建控制流仍有问题 |
| RT-03 服务身份 | RETURN | 未知实例拒绝有价值；正确启动器子进程不能复用，新启动成功路径仍只等待 HTTP 200 |
| RT-04/SF-11 本机统一验证 | PASS（本机入口） | Reviewer 重新运行 verify 退出 0，PayPal 19 测试、支付边界、商品和组件契约实际执行；lint 0 error/3 warnings |
| RT-04/SF-11 干净 CI/完整门槛 | RETURN | 缺源码库外文档和必要构建变量；远端从未运行，本机构建不能补足该证据 |
| 外部条件盘点 | PASS（清单完整性） | PayPal 补充资料已收到，认证、商户资格及钱货闭环尚未验证 |

完整构建日志是执行方证据，本轮未重复生成 .next/.medusa；也未重复旧安全测试的真实进程停止。Reviewer 仅在 Review 目录创建探针/fixture/log，并重新运行已审阅的只读 verify。未改主项目文件、未触碰数据库、未发起 PayPal API、未真实停进程、未提交。

## 独立确认的返修项

### B1-R02-A / P1：进程树仍可包含旧 PID 所属的孤儿子进程

位置：应用 scripts/_common.ps1:274-290,384-392。Get-ManagedProcessTree 只按 ParentProcessId 建树，没有检查每一条父子边的创建时间或其他可信归属关系。当前受管根合法，不代表所有保存该 ParentProcessId 的旧进程都属于它。后续快照相等只能证明子进程自己未变，不能证明它属于当前这一代父进程。

独立探针加载实际函数，以创建时间早于合法根五分钟的子进程作为输入，并将所有系统查询和 Stop-Process 替换为内存 fixture。结果 ORPHAN_OLDER_THAN_VERIFIED_ROOT_WOULD_BE_KILLED=True。没有真的误杀或诱发操作系统 PID 复用。

修复每条祖先关系与实例身份验证；恢复 visited 集合/环检测，避免 PID 重用形成伪环导致无限递归。在每次实际终止前即时比较目标身份，而不是先检查全树，之后仅判断 PID 仍存在。根/子进程创建时间来自同一来源时，审视当前一秒容差是否会放过另一个快速重启实例。测试应包含旧孤儿、子 PID 变化、伪环，不用用户进程试杀。

### B1-R02-B / P1：停止被拒绝后，调用者照常移动运行产物

位置：_common.ps1:371-405；scripts/build-production.ps1:24-33,53。

Stop-ManagedProcess catch 吞掉全部异常，仅输出 REFUSED_STALE；构建调用者没有读取结果，随后 Move-GeneratedTree 移走 .medusa/.next。旧格式、命令不符或实际停止失败时，可能在服务仍运行的情况下替换其工作产物。

独立内存探针：CALLER_CONTINUES_AFTER_STOP_REFUSAL=True。修复为可判断结果或失败传播，在无法确认相关服务安全停止时阻断依赖构建/移动；区分已退出与仍运行但未知归属，不要为了继续构建强制杀掉未知进程。验证必须断言 Move/Build 没有被调用。

### B1-R03 / P2：正确监听子进程被拒绝，新启动路径也未做最终归属验收

位置：_common.ps1:313-327；start-local.ps1:64-70,85-92。

复用函数要求监听 PID 等于记录的启动 PID。实际 storefront 使用 Corepack→pnpm→Next 启动链；现有 RT-03 正例直接让 PowerShell 测试进程监听，不能覆盖这一模式。独立内存探针给出合法 root 与较晚创建的监听 child，结果 VALID_ROOT_WITH_LISTENING_CHILD_DECISION=IDENTITY_CONFLICT。这里证明的是函数拒绝该合法模型，本轮没有重启真实 Next。

可选择直接启动实际服务可执行入口并记录监听者，或验证可信子进程链；不能通过放宽成“任意后代”重新引入 RT-02 漏洞。首次启动的 Wait-LocalHttp 后也应重新检查监听归属，不能把任意 200 当 READY。补启动→再次复用→停止的实际受控启动链测试，并设置 HTTP 探测超时，避免已连接但不响应时无限等待。

### B1-R04 / P1（CI 门槛）：只有本机能通过，干净检出还不能执行同一套验收

位置：源码根 .github/workflows/verify.yml；04_docs/scripts/92-prepare-review-staging.security.tests.ps1:262-264；storefront/check-env-variables.js；storefront/next.config.js:1-3。

CI 只检出源码 Git 仓库，staging 测试却无条件读取其父目录 00_HANDOFF.md。独立最小源码检出布局探针在进行任何 staging 操作前即退出 1，原因为该文件不存在。需要由测试创建完整独占工作区 fixture，不能要求 CI 挂载用户文档仓库，也不能静默跳过安全测试。

workflow 也没有提供 NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY 等构建条件；该字段由 next.config 加载时强制检查。Reviewer 在独立 node 子进程清除这一变量，运行实际检查器退出 1。修复非秘密的构建环境、所需可控后端/构建策略，禁止携带本机 .env 或真实支付密钥进 CI。pnpm 缓存使用前先保证固定版本包管理器可用，避免依赖 runner 恰好预装。

以不含 .env/.runtime/父目录文档的源码检出验证；真实远端未运行时仍必须写明。verify:build 目前仅执行 build，统一 verify 未包含 PowerShell 安全测试；补清楚本地完整门槛和 CI 一致调用关系，不能将局部命令成功表述为整个门槛成功。

### B1-R05 / P2：测试自身的隔离与断言还需一并收紧

RT-02/03 测试 finally 按保存的裸 PID 逐个 Stop-Process，包括先前已结束的 PID；目录 cleanup 也缺独立绝对边界/reparse 复核。生产安全逻辑的测试不能自己继续采用同类不安全清理方式。

verification-gate.security.tests.ps1 把类型错误写到固定正式源码路径，再无条件删除；需要唯一测试路径、存在即拒绝/隔离副本，不能覆盖其他工作。测试故障注入目前只是断言子命令非零，应在同一顶层 verify 入口验证，并核对确为注入诊断而非依赖/环境失败。

R1 另有两个可以随 CI 修复的测试细节：WRONG_MARKER_PATH 同时写错 tool/package，多字段错误不能单独证明路径绑定；应复制正确 marker 后仅改路径或移动到另一 fixture。Invoke-ChildStaging 的 Write-Output 被调用者 [void](...) 一并丢弃，子进程原始流未进入日志；请分别保存 stdout/stderr，保留现有顶层原始日志。它们不推翻已独立验证的本机主脚本安全结论。

## 独立证据文件

- independent-runtime-probes.ps1 / .log：实际函数＋全模拟 OS 层；以上三个确定反例。
- clean-checkout-staging-probe.log / .exit.txt：独占最小检出布局，无用户目录删除。
- clean-build-env-probe.log / .exit.txt：真实构建变量校验器的缺失条件。
- unified-verify.log：Reviewer 重新执行 corepack pnpm@10.11.1 run verify，退出 0；保留 warnings，未忽略类型或测试。
- SOURCE_HASHES.json：本轮实际变更文件 hash，便于后续集中增量验收。

## PayPal 补充资料

用户指定 Desktop/PayPal信息.txt 由本机程序读取，仅输出字段存在性：含 Client ID、Secret、sandbox、business、邮箱相关字段/文字，未看到 webhook ID 标签或明确 Live 标记。没有把凭据内容、账户邮箱或密码写进 Review。这里只确认资料存在，不确认账户归属、商户国家、币种能力、App 与账户对应关系或认证成功。

官方流程是 Client ID/Secret 换 OAuth token；沙箱交易使用商户 Business 与买家 Personal 两类账户。下一批可做限定沙箱的最小认证可用性核验和 transport 实现，不把认证成功当支付/生产资格 PASS。参考：[PayPal Authentication](https://developer.paypal.com/api/rest/authentication/)、[Sandbox accounts](https://developer.paypal.com/sandbox-testing/accounts)。

## 下一步

BATCH-02 合并：以上运行/CI 返修＋已有商品/账户/购物车/交易正确性＋支付身份金额退款幂等/事件边界＋沙箱认证准备。依赖安全运行修复的启动/构建等待其自测通过；纯业务修复可继续，不逐项等待 Reviewer。实际钱货闭环仍在随后批次验收，保留冻结架构/UI与真实支付默认关闭。