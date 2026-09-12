# BATCH-06-R1 独立复审决定

复审日期：2026-09-08（Asia/Shanghai）  
最终目标：独立站正常使用并上线  
Reviewer 决定：`BATCH-06-R1=RETURN`  
分项结论：`DOCKER_AND_LOCAL_RUNTIME=PASS_WITH_SCOPE`、`ISOLATED_INTEGRATION=PASS_WITH_SCOPE`、`PAYPAL_PROVIDER_E2E=NOT_EXECUTED`、`RELEASE_READINESS=FAIL`

## 总体判断

本轮比 BATCH-06 有实质进展。真实 Docker 镜像已通过可访问的 registry mirror 构建，最终镜像以 non-root 用户运行，production artifact 的工作目录和入口脚本已实际验证；14 个镜像层和 runtime artifact 的密钥扫描没有高置信度命中。隔离 PostgreSQL/Redis 上的迁移、server/worker、健康检查、优雅停止、Store API/cart 流程和 Webhook 数据库并发重放也有日志支撑。

但这仍是“本地 Release Candidate + 外部前置阻塞”，不是可上线版本。Backend host、公开 DNS/TLS/ingress 和 Sandbox merchant/buyer 链路不存在，因此没有真实签名 PayPal Webhook、provider refund read-back 或唯一 Sandbox 交易。不能把 local deterministic retrieve seam 当作 PayPal provider 证据。

## 已接受的证据范围

| 领域 | 结论 |
|---|---|
| Docker build | PASS：mirror-resolved base 上真实 no-cache build exit 0 |
| Image layer secret scan | PASS WITH SCOPE：14 compressed layers、artifact 和 entrypoint 无高置信度 secret/PEM 命中；扫描器为项目脚本，不是独立 Trivy/Grype 结果 |
| Artifact cwd/roles | PASS WITH SCOPE：artifact cwd、non-root、migrate/server/worker、health/stop 有运行日志 |
| Isolated DB/Redis | PASS WITH SCOPE：fresh local containers；PostgreSQL 使用 `sslmode=disable`，TLS Redis 单独验证，非托管环境证明 |
| Store API | PASS WITH SCOPE：9 个内部 HTTP case 返回 200；未覆盖完整客户路由矩阵和 hosted browser matrix |
| Webhook dedupe | PASS WITH SCOPE：真实隔离 PostgreSQL 并发 1 claim/7 replay/1 row；未经过真实 Medusa payment state 推进 |
| Refund | NOT PROVEN PROVIDER：数据库状态和确定性 retrieve seam 通过；没有 PayPal response、worker 或真实 Medusa Refund read-back |
| Sandbox | BLOCKED：无 receiver/host/DNS/TLS，未执行交易或签名 Webhook |
| Live | PASS CLOSED：证据声明未读取 Live Secret、未调用 Live endpoint |

## 关键问题

### P0：外部上线链路未闭合

必须提供并验证一个可运行 Medusa Backend host，配套隔离 Sandbox PostgreSQL/Redis、公开 HTTPS receiver、DNS/TLS/ingress 和 PayPal Sandbox merchant/buyer flow。当前用户给出的 Vercel 只足以承载 Storefront，不能作为持久 Medusa server/worker 的证明。

### P0：支付状态方法没有发现生产调用方

独立搜索只找到 `markAppliedAfterMedusaReadback` 和 `reconcileRefundOperation` 的方法定义，以及单元/隔离测试调用；没有发现 webhook dispatch 完成后由 Medusa 状态 read-back 调用 `markAppliedAfterMedusaReadback` 的 worker/订阅者，也没有发现 `reconcileRefundOperation` 被 durable worker 或实际 CLI 调用。当前日志中的 `dispatch_requested>applied` 是直接服务测试，不能证明线上队列会自动收敛。

### P1：运行与供应链证据边界

- 构建通过 mirror-resolved base，但 Dockerfile 仍使用可变 tag `node:22.14.0-bookworm-slim`，没有把 digest 固定进发布定义；应在正式 CI 固定 digest 并记录来源。
- 镜像扫描是项目脚本的高置信度模式扫描，不等同于独立漏洞/secret scanner；上线前至少增加一项独立扫描器或说明接受范围。
- 本地 pnpm/Node 与目标工作区曾出现版本不一致；R1 镜像内 Node 22.14/pnpm 10.11.1 已通过，但远程 clean CI 仍未执行。
- `USER_ACTION_PACKET.md` 要求再次提供 Sandbox 凭据；这些凭据和 Webhook 注册已经验证，不应重复索取。真正缺少的是 Backend host、部署访问和 Sandbox merchant/buyer 操作链。

## 下一步顺序

1. 选定持久 Backend host 并建立隔离 Sandbox DB/Redis；不把 Vercel Storefront 当作 Backend host。
2. 部署当前 immutable image，配置精确 Sandbox receiver 路由，验证 DNS/TLS/签名 Webhook → Inbox → Medusa read-back。
3. 把 `markAppliedAfterMedusaReadback`、refund reconciliation 接入实际 worker/事件处理路径，并用失败/重启/乱序测试证明可恢复。
4. 只创建一笔 `14.99 USD` AUTHORIZE Sandbox 交易，完成 capture、partial refund、同 operation replay 和 PayPal read-back；Live 继续关闭。
5. 完成远程 Node 22/pnpm 10 CI、独立镜像扫描、hosted browser matrix、备份恢复和回滚演练，之后才进入 Preview/生产推广。

## 当前不应修改

- 不重新设计冻结的 Medusa/Figma/Web UI、品牌、字体、信息架构或选品。
- 不修改 `PAW-PHR-001`、SKU 或 `14.99 USD`，不创建重复商品/变体。
- 不开启 Live endpoint、真实收费、生产库存写、DNS 变更或真实邮件，直到 Sandbox 纵向闭环和 Reviewer 复审通过。

## 证据

- [BATCH-06-R1 执行报告](../../execution/BATCH-06-R1/BATCH_REPORT.md)
- [Finding Matrix](../../execution/BATCH-06-R1/FINDING_MATRIX.md)
- [Docker 结果](../../execution/BATCH-06-R1/A-docker/FINAL_RESULT.md)
- [隔离集成结果](../../execution/BATCH-06-R1/C-integration/RESULT.md)
- [支付结果](../../execution/BATCH-06-R1/B-paypal/RESULT.md)
- [平台阻塞](../../execution/BATCH-06-R1/D-platform/BLOCKER.md)
