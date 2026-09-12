# BATCH-04 用户输入处理结果（脱敏）

日期：2026-09-07

本文件只记录 Reviewer 可安全使用的结论，不复制用户在聊天中提供的 PayPal 密钥或完整账号资料。

## 已确认

| 项目 | Reviewer 处理结果 |
|---|---|
| Storefront 托管 | Vercel；仅视为 Next.js Storefront 目标平台。 |
| PostgreSQL | Supabase PostgreSQL；尚未创建/验证生产连接、迁移与备份。 |
| Redis | Upstash Redis；当前源码尚未接入 Redis infrastructure modules。 |
| Object Storage | Cloudflare R2；当前源码尚未配置 Medusa S3-compatible file provider。 |
| DNS / Domain | `spikspikeapi.dpdns.org`，用户说明由 Cloudflare DNS 管理；2026-09-07 公共 DNS 探测未发现 A/AAAA/CNAME，HTTPS 尚不可达。 |
| Email | Resend 可用作候选；当前尚未接入。 |
| PayPal Business Live | 用户确认有资格并存在 live App。 |
| 负责人 | Spike Wang。 |
| 客服邮箱 | 用户已提供；在隐私/客服政策定稿前不在 Review 文档重复公开。 |

## 凭据处理

用户把 PayPal Live Secret 直接粘贴到了聊天中。该值现在必须视为已暴露：

- Reviewer 未调用、未验证、未保存、未复制该 Secret；
- 后续 Executor 禁止使用该值；
- 上线前必须在 PayPal Developer Dashboard 轮换/撤销；
- 新 Secret 只能写入生产 Secret Manager，不能进入聊天、源码、patch、日志、证据或普通文档；
- Live App Client ID 也不需要在 Review 文档重复记录。

## 可以以后填写的 3～5 项

库存/直发模式、包装重量尺寸/原产地/HS 证据、承运商/运费/时效/退货地址/退款争议责任都可以在供应商和履约方案确定后填写。当前状态统一为 `DEFERRED_USER_FACT / PRODUCTION_CHECKOUT_HOLD`。

这些未知项不阻塞：代码修复、隔离数据库测试、PayPal Sandbox、CI、依赖加固、部署配置模板和浏览器验证。它们会阻塞：生产库存写入、向客户展示真实运费/时效、Live PayPal 开放、真实订单和正式上线。

## 仍需一个后续托管决定

Medusa 官方生产形态需要 PostgreSQL、Redis，以及分别运行的 server 与 worker。Vercel 用于 Storefront；Medusa Backend 需要一个支持常驻 Node 进程和 worker 的平台。BATCH-05 先生成平台无关的容器、server/worker 和迁移方案，完成后再用一次合并输入让用户选择 Backend 托管平台。

