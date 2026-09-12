# BATCH-05 独立复审决定

复审日期：2026-09-07（Asia/Shanghai）  
最终目标：独立站正常使用并上线  
Reviewer 决定：`BATCH-05=RETURN`  
分项结论：`LOCAL_VERIFICATION=PASS`、`PAYPAL_SANDBOX=NOT_EXECUTED_RECEIVER_UNDEPLOYED`、`RELEASE_READINESS=FAIL`

> 2026-09-08 补充：固定 Sandbox OAuth 端点返回 HTTP 200，Webhook ID/URL read-back 返回 HTTP 200 且与本地记录匹配。PayPal 后台注册已确认可用，但两个公开 receiver URL 的域名当前无 DNS 解析，未发现实际部署绑定，因此交易与真实 Webhook 仍未执行；BATCH-05 仍因本文 P0/P1 保持 RETURN。

## 总体评价

BATCH-05 建立了有价值的本地基础：统一验证、33 项 Backend 测试、运行安全测试、PayPal sandbox-only fail-closed、Webhook Inbox migration、库存请求计划、Linux CI 文件和部署草案都比上一批完整，执行报告对未完成项也基本诚实。

但当前实现仍是“可继续开发的安全骨架”，不是可开启 Sandbox 客户支付或可上线的 Release Candidate。独立复审发现多个执行报告未识别的 P0，其中支付重放、容器密钥边界和生产基础设施回退会造成业务重复、密钥泄漏或生产运行方式错误；PayPal 后台注册也尚未连接到可达的 receiver 部署。BATCH-05 不得标记 PASS/CLOSED。

## 独立验证结果

| 检查 | 结果 |
|---|---|
| `pnpm run verify` | PASS，退出码 0 |
| Backend tests | 33/33 PASS |
| RT-01 / RT-02 / RT-03 / RT-04 | 37 PASS + 1 SKIP / 9 PASS / 7 PASS / failure injection PASS |
| 生产基础设施配置下 Backend build probe | PASS；只证明编译，不证明服务/Redis/R2 可运行 |
| `pnpm audit --prod` | 0 critical / 0 high / 1 moderate，退出码 1 |
| `git diff --check` | PASS |
| 更新后 Sandbox OAuth 固定端点复核 | HTTP 200；Webhook ID/URL read-back HTTP 200；未创建交易 |
| PayPal receiver DNS/HTTP | 共享域名无 A/AAAA/CNAME 解析；Sandbox/Live URL 均不可达，未发现部署绑定 |
| 主项目代码修改 | Reviewer 未修改；保留 Executor 的 83 个未提交状态项 |

证据：

- [独立统一验证日志](INDEPENDENT_VERIFY_LOG.txt)
- [独立生产配置构建探针](PRODUCTION_CONFIG_BUILD_PROBE.txt)
- [独立依赖审计](INDEPENDENT_AUDIT_PROD.json)
- [PayPal 独立复审](agent-paypal/REVIEW.md)
- [库存与 Store API 独立复审](agent-inventory/REVIEW.md)
- [CI 与部署独立复审](agent-ci-deploy/REVIEW.md)

## P0：必须先修复

### 1. Docker 构建会把本地凭据带入镜像

构建上下文没有 `.dockerignore`，Dockerfile 使用 `COPY . .`，运行镜像又复制整个 `/app`。本机实际存在 `apps/backend/.env` 与 `apps/storefront/.env.local`。Git ignore 不保护 Docker build context，因此数据库或支付凭据可能进入镜像层和最终文件系统。

### 2. 生产基础设施不是 fail-closed

`NODE_ENV=production` 时，`MEDUSA_PRODUCTION_INFRASTRUCTURE_ENABLED` 缺失仍默认为 false，Redis/S3 模块会全部省略；`workerMode` 仍默认 `shared`；Session Redis 和 Worker Admin 禁用也未配置。错误环境变量可能产生一个“启动成功但使用内存/本地模块”的生产实例。

### 3. R2 与 S3 Provider 默认 ACL 不兼容

当前 `@medusajs/file-s3` 配置没有 `acl: false`。已安装 2.19.0 实现默认向 PutObject/Multipart 请求附带 ACL，而 Cloudflare R2 不支持 `x-amz-acl`。同时，连接公开 custom domain 的桶不能再承诺桶内其他对象保持私有。

### 4. Webhook Inbox 没有实现业务幂等

重复 event 虽命中同一 Inbox 记录，但 `replayed` 返回值被忽略，Provider 仍再次向 Medusa 返回 `authorized`/`captured`。并发或重放可能重复推进支付/订单。Inbox 还在 Medusa 真正执行动作前写成 `applied`，进程在返回后失败会留下虚假成功状态。

### 5. 已验签事件可能在入库前丢失

当前顺序是验签 → 关联/映射 → 入库。任何关联查询或 mapping 失败会使已验签事件完全不进入 Inbox。Payments v2 capture 查询补回的 session ID 只存在于临时 payload，入库仍使用原事件，导致 correlation 丢失。

### 6. Refund Webhook 与恢复链路不能收敛

官方退款事件常从 `related_ids.capture_id` 开始，当前实现强制读取 `order_id`；项目发起退款时也没有建立可持久查询的 refund/capture/order/session 映射。`paypal-reconcile.mjs` 目前只打印 JSON，不访问数据库或 PayPal。PENDING、超时、重启、失败、reversal 和 dispute 都没有真实恢复闭环。

### 7. 商品可能先发布、库存后失败

Product upsert 先写最终 `published` 状态，再同步库存。任何 location、level 或 read-back 失败都可能留下客户可见的半配置商品。真实 Medusa 隔离数据库上的 create → rerun → update → concurrency 也没有执行。

## P1：上线前完成

1. Store API 脱敏中间件缺少 product-variants、cart customer/promotions/taxes 等客户可达响应；需要真实 HTTP integration matrix。
2. 库存没有验证 product → sales channel → location → publishable key → region 的完整关系，`reserved/available` 只查字段存在，不核对数值。
3. 容器没有从 Medusa 生成的 `.medusa/server` production artifact 启动，也没有 non-root 与镜像级 server/worker/migration smoke。
4. Vercel 文档的 Root Directory 与 build command 相互矛盾；按文档从 app root 执行会失败。还缺 monorepo 外部文件选项、Node 版本和 R2 image hostname 说明。
5. CI 与 Docker 固定 Node 20。当前日期 Node 20 已 EOL，且 Vercel 已宣布 2026-10-01 后禁用新的 Node 20 部署，应统一迁移到 Node 22。
6. Supabase 尚未根据 Backend host 确定 direct 或 session pooler，也没有 TLS、连接预算、备份/恢复演练与迁移回滚。
7. Upstash 缺 Session Redis、环境隔离、BullMQ 保留/容量/满容量行为和 server+worker restart 测试。
8. `deploy/rollback.md` 实际不存在；部署 README 的 Review 文档相对链接指向错误位置。
9. 根 `package.json` 的 `pnpm.overrides` 被 pnpm 10.11.1 明确警告忽略。当前 frozen lock 仍含旧 override 结果，但后续 lockfile 更新不能依赖这个声明；应统一迁到 `pnpm-workspace.yaml`。
10. 83 个未提交状态项跨越多个批次，远程 CI 尚未运行。修复完成后需要形成可审查的提交边界，再进入 Preview/生产阶段。

## 风险接受

AJV 唯一 Moderate 是 `$data: true` 条件下的 ReDoS，路径来自 Medusa CLI/迁移工具链，未发现客户输入可达的项目代码。允许在 Sandbox 阶段暂时接受并记录 owner/到期日；它不应压过上述 P0，也不应通过全局 AJV override 冒险破坏依赖图。生产推广前重新审计。

## 建议执行顺序

1. 先修 Docker secret boundary、生产 fail-closed、Session Redis、worker 角色和 R2 ACL。
2. 修 Webhook 原子 claim、真实 applied 语义、已验签先入库和 refund/capture/session 持久关联。
3. 修商品发布顺序，完成真实隔离库存并发与 Store API HTTP 脱敏矩阵。
4. 迁移 Node 22、修 pnpm overrides、容器 production artifact、Vercel 配置和 rollback runbook。
5. 在隔离 Medusa + PostgreSQL + Redis 上跑 server/worker/restart/concurrency 和浏览器矩阵。
6. 完成本地 P0/P1 后，部署隔离 Sandbox receiver 并先验证 DNS/TLS/HTTP、签名 Webhook、Inbox 落库和重放语义；再只做一次固定 Sandbox OAuth preflight，复用唯一交易完成 authorize/capture/partial refund/webhook/read-back。Live 继续保持关闭。
7. BATCH-06 复审通过后，再集中确认 Backend host 与真实库存/物流/退货事实，随后做 Preview、DNS、邮件、Live secret 轮换、Live 小额订单与回滚验收。

## 当前不应修改

- 不重新设计已冻结的 Medusa/Figma/Web UI、品牌、字体和信息架构。
- 不重新选品，不创建重复商品/变体，不修改 `PAW-PHR-001` 与 `14.99 USD`。
- 当前真实商品继续保持 `LOCAL_PREVIEW_AVAILABILITY`、`manage_inventory=false`，直到库存和履约事实确定。
- 保留 RT-01/02/03/04 已通过的安全边界和统一验证入口。
- 保留客户 PayPal 关闭、Sandbox-only 三重阻断；本批不解除 Live gate。
- 不虚构库存、包装、原产地、HS、承运商、退货、税务或政策事实。
- 不用广泛依赖 override 追求 audit 数字，不把 QQ 邮箱当作 Resend 已验证发件域名。

## 用户介入

当前不需要用户介入，Executor 可以先完成所有本地修复。Sandbox Client/Secret 已在固定 OAuth 端点验证为 HTTP 200，且后台 Webhook ID/URL read-back 匹配。后续需要在已选定的 Backend host 上部署隔离 Sandbox receiver，并将共享域名 DNS/TLS/路由真正指向该 receiver；不要通过聊天发送密钥，也不要使用已暴露的 Live Secret。

## 参考资料

- Medusa production deployment: https://docs.medusajs.com/learn/deployment/general
- Medusa payment webhooks: https://docs.medusajs.com/resources/commerce-modules/payment/webhook-events
- Medusa S3 provider: https://docs.medusajs.com/resources/infrastructure-modules/file/s3
- PayPal authentication: https://developer.paypal.com/api/rest/authentication/
- PayPal webhooks: https://developer.paypal.com/api/rest/webhooks/rest/
- Supabase connections: https://supabase.com/docs/guides/database/connecting-to-postgres
- Upstash BullMQ: https://upstash.com/docs/redis/integrations/bullmq
- Cloudflare R2 S3 compatibility: https://developers.cloudflare.com/r2/api/s3/api/
- Vercel monorepos: https://vercel.com/docs/monorepos
