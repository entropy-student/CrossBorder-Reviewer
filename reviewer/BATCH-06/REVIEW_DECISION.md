# BATCH-06 独立复审决定

复审日期：2026-09-08（Asia/Shanghai）  
最终目标：独立站正常使用并上线  
Reviewer 决定：`BATCH-06=RETURN`  
分项结论：`LOCAL_STATIC_CONTRACTS=PASS`、`DOCKER_ARTIFACT=BLOCKED`、`PAYPAL_SANDBOX=BLOCKED`、`RELEASE_READINESS=FAIL`

## 总体判断

BATCH-06 完成了一批重要的本地代码和静态契约修复。报告对 Docker 网络失败、未创建订单、未调用支付 API 和未使用真实凭据的陈述一致，未发现执行 Agent 越权修改数据库或进行真实收费的证据。

但本批不能 PASS。Docker 构建停在获取 `node:22.14.0-bookworm-slim` 基础镜像元数据阶段，尚未执行 Dockerfile 的 build/runtime 层，因此没有镜像层密钥扫描、非 root 容器启动、server/worker/migrate smoke 或镜像 digest 证据。报告同时确认没有公开 Backend host、DNS、TLS 或 Sandbox receiver，所以 PayPal 真实签名 Webhook 和唯一 Sandbox 交易尚未开始。多个“PASS”仍是源码/契约级结果，不是托管环境级结果。

## 独立复核结果

| 检查 | 结果 | 说明 |
|---|---|---|
| Docker secret boundary | PASS（静态） | `.dockerignore`、无整树 runtime COPY、non-root、entrypoint 权限断言通过 |
| Docker image build | BLOCKED | `auth.docker.io:443` 超时，发生在基础镜像元数据阶段 |
| Image layer scan | NOT RUN | 没有生成镜像，不能推导为 PASS |
| Container server/worker/migrate | NOT RUN | 没有镜像和运行日志 |
| Production config contract | PASS（本地） | fail-closed、Redis TLS、角色和 CORS 测试通过；真实托管配置未验证 |
| R2 ACL | PASS（静态） | `acl:false` 断言通过；真实 R2 请求和 `x-amz-acl` 缺失未验证 |
| Webhook claim/applied | PARTIAL | 单元/契约语义已增加；真实数据库并发、重启、HTTP route 未证明 |
| Refund/reversal/dispute | PARTIAL | durable model/seam 存在；真实 provider read-back、worker 收敛和 Medusa Refund 记录未证明 |
| Inventory / publish order | PARTIAL | draft-first 静态契约；隔离 Medusa DB 并发和数值 read-back 未证明 |
| Store API privacy | PARTIAL | 路由覆盖增加；完整真实 HTTP route matrix 未证明 |
| Node/CI/Vercel/rollback | PARTIAL | 文档和本地检查存在；remote CI、Preview、Backend host 和 rollback drill 未执行 |
| Browser matrix | PARTIAL | 既有 baseline；320/375/768/1440/200% 新矩阵未完整采集 |
| PayPal Sandbox vertical | BLOCKED | receiver 无部署/DNS/TLS，未执行交易、签名 Webhook 或 read-back |

本地复核：`node deploy/docker-boundary.test.mjs` 与 `node deploy/r2-acl-boundary.test.mjs` 均退出 0；两者明确输出 image scan / external R2 fixture 未运行。直接运行 pnpm 命令在当前检查环境因 pnpm 尝试清理 modules 且无 TTY 退出，不能作为对 BATCH 报告通过项的替代证明。

## 必须补证

### P0

1. 在能访问 Docker Hub 或受控 registry mirror 的干净 Linux CI/构建机重建当前 Dockerfile，保存基础镜像 digest、build exit code、镜像层 secret 扫描和最终文件清单。
2. 用同一 immutable image 分别运行 `migrate`、`server`、`worker`，验证 non-root、health/readiness、worker Admin disabled、graceful shutdown 和日志脱敏。
3. 选择 Backend host，部署独立 Sandbox PostgreSQL/Redis 和 receiver，验证精确 DNS/TLS/ingress、真实 signed Webhook → Inbox → Medusa read-back；随后才执行唯一 Sandbox 交易及 refund/read-back。Live 继续关闭。
4. **验证 production artifact 的启动目录**：当前 runtime 只复制 `/app/apps/backend/.medusa/server`，但入口脚本从 `/app` 直接调用 CLI；生成的 `medusa-config.js`、`package.json` 位于 artifact 目录。必须在真实镜像中证明 `server`、`worker`、`migrate` 能从正确 cwd 启动，否则 Dockerfile 的 artifact 设计仍可能启动失败。

### P1

1. 真实隔离数据库跑 Webhook duplicate/并发/中断重启，以及 refund partial/replay/convergence。
2. 真实 Medusa API 跑 inventory create/rerun/update/concurrency 和完整 Store API HTTP route matrix。
3. 真实 R2 fixture 验证请求不含 `x-amz-acl`，并证明公开媒体桶与私有对象边界。
4. 证明 `MEDUSA_LOCAL_RUNTIME` 不能在托管生产环境绕过 production validation；必要时限制或移除该入口。
5. 用 Node 22.14、pnpm 10.11.1 clean frozen install 和远程 CI 重跑关键验证。

## 当前不应修改

- 不重新设计冻结的 Medusa/Figma/Web UI、品牌、字体和信息架构。
- 不重新选品，不修改 `PAW-PHR-001`、SKU 或 `14.99 USD`，不创建重复商品/变体。
- 不开启客户 PayPal、Live endpoint、真实收费、生产库存写、DNS 变更或真实邮件。
- 不把静态 PASS、构建前网络失败或既有本地 HTTP 200 写成真实部署成功。

## 证据

- [BATCH-06 执行报告](../../execution/BATCH-06/BATCH_REPORT.md)
- [Docker 结果](../../execution/BATCH-06/A-deploy-secrets/RESULT.md)
- [Docker 构建日志](../../execution/BATCH-06/A-deploy-secrets/docker-build-after-entrypoint-fix.log)
- [静态回归日志](../../execution/BATCH-06/A-deploy-secrets/deploy-contract-entrypoint-regression.log)
- [Finding Matrix](../../execution/BATCH-06/FINDING_MATRIX.md)
