# RT-01 独立复审：RETURN

日期：2026-09-06。当前任务：RT-01-R1。最终目标：独立站正常使用并上线。

结论：删除保护的主体实现通过本次独立函数探针；整项暂不关闭，返修测试与证据。未发现本次探针覆盖范围内可绕过 allowlist/ownership/reparse 校验的路径。不能将这些局部结果扩展为完整打包或上线 PASS。

## 独立证据

- 直接读取实际工作树脚本、测试、diff、执行报告；没有沿用执行方的 26/26 结论。
- `independent-probes.ps1` 通过 PowerShell AST 仅加载实际脚本的函数定义，不执行顶层复制、打包或删除逻辑。
- `pwsh -NoProfile -File independent-probes.ps1`：19/19，进程退出码 0；逐项输出在 `independent-probes.log`。实际受保护路径仅调用校验函数；marker/junction 操作仅发生在本目录唯一 fixture 下，没有执行递归删除。fixture 保留，junction 目标也在同一 fixture 内。
- 覆盖：真实源码/子目录/大小写/尾分隔符/文档中心/祖先/用户目录/盘根/可信根/相似前缀/路径穿越，新子目录允许、缺失 marker、正确 marker、错误任务、跨路径复制 marker、损坏 JSON、junction 本体/祖先/已有目录内部。
- 探针第一次 Windows PowerShell 5.1 启动因 Reviewer 文件 UTF-8 无 BOM 导致中文路径读取失败，尚未建立 fixture；将 Reviewer 探针保存为 UTF-8 BOM 后，用已存在的 pwsh 成功执行。该准备错误不归因于项目，不计入通过项。
- 主脚本 SHA256：`84892FF43FEFE49B9E7199AFFB5B10B9CEA7CFD95B3A80A90C58C250A40F40D4`。
- 待返修测试 SHA256：`AD34E6413B67865E6AB8C860E872F9180644926AF1D501BF21235A319F774D8F`。
- 文档 HEAD：`38e879c42ead6e561939a7881526c2a984c158a2`，status 空；源码 HEAD：`4b7dd0f371f13cc3ee1f598499dcecbf63b33fec`，仅主脚本 modified、测试 untracked。本 Reviewer 未修改主项目文件。

## 返修项

### R1-01 / P1：负例回归测试仍将真实受保护路径传给破坏性入口

位置：`04_docs/scripts/92-prepare-review-staging.security.tests.ps1:44-52,72-87,138-142`。

这些测试把真实源码、文档中心、工作区祖先、用户目录、盘根交给完整脚本执行。当前实现会拒绝，但安全回归测试必须能在保护失效时安全地失败；它不能依赖正在测试的保护来避免删除真实资料。最后比较两个文件的内容，也无法事先阻止破坏或覆盖其他文件。

修复：真实危险路径用例只加载并调用实际纯校验函数，不进入顶层删除/复制。删除和重跑集成只允许独立验证边界、归属、reparse 链后的测试专用目录。测试自身 cleanup 也要验证最终绝对路径与归属；不能只因变量名叫 testRoot 就递归删除。保持现有主脚本即可，不要求为测试重构它。

### R1-02 / P2：失败原因未断言，跳过项也进入 PASS

位置：同测试 `44-52,114-120,146-151`。

负例仅检查 `exit != 0`。脚本解析失败、复制失败、依赖缺失，甚至删除后才发生的错误，都可能被该断言算作正确拒绝。junction 创建失败分支把 `NOT_TESTED` 作为 Passed=true 加入结果，也会产生整体 PASS。

修复：断言预期安全错误原因/类型，并在涉及文件的负例检查 fixture 完整性；非预期异常必须 FAIL。分离 PASS/FAIL/SKIP，未执行项不得增加 PASS 数。补一个无副作用的测试自校验，证明非安全异常不会被当作成功拒绝。junction 能力不足要明示，禁止伪装成已验证；symbolic-link 可单列未测，不要求为了本轮修改系统权限。

### R1-03 / P2：RAW_TEST_LOG 实际为摘要格式，缺少可直接复核的原始输出

`execution/RT-01/RAW_TEST_LOG.txt` 使用 `REJECT_SOURCE_ROOT=PASS (child exit=1; ...)` 等摘要，而实际测试代码输出为 `NAME=PASS;exit=...;output=...`，且记录中的 TEST_CLEANUP 等行并非该脚本的输出语句。现有文件不能作为未经改写的 stdout/stderr 证据；这不等于断言测试没有执行。

修复：R1 独立目录保留真实运行 stdout/stderr，另记命令、shell 版本、开始/结束时间、退出码及两文件 hash。摘要写入报告，不能替代原始流。旧证据保留，不覆盖。引用保护完整性时准确区分文件内容比较与 SHA256 哈希比较。

## 保留与范围

保留严格 staging 子目录、路径指纹 marker、全路径链及目录内 reparse 检查、两次删除前校验。保持冻结 Medusa/Figma/Web UI 与业务代码。无需本轮完整 ZIP、RT-02/RT-03、依赖升级或支付操作。输出文件覆盖策略作为后续打包边界事项保留，不借本次测试返修扩展范围。

通过门槛：三个返修项全部关闭，独立复核新测试实际代码和原始运行证据后才将 RT-01 改为 PASS；下一项为 RT-02 进程身份与停止安全。
