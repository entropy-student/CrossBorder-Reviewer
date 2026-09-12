# BATCH-07 Finding Matrix

| ID | Finding | Severity | Status | Evidence |
|---|---|---:|---|---|
| B07-P0-01 | 没有已批准的持久 Backend host、云项目或部署访问；Vercel 不能承载持久 Medusa server/worker | P0 | BLOCKED | `A-host/BLOCKER.md`, `A-host/host-access-check.log` |
| B07-P0-02 | 公开 DNS/TLS/HTTPS receiver 未部署，无法接收真实 signed Sandbox Webhook | P0 | BLOCKED | `B-sandbox-receiver/RESULT.md` |
| B07-P0-03 | 生产代码搜索未发现 `markAppliedAfterMedusaReadback` 与 `reconcileRefundOperation` 由 worker/subscriber/CLI 实际调用 | P0 | NOT PROVEN | `B-sandbox-receiver/production-caller-search.log` |
| B07-P0-04 | 唯一 Sandbox 14.99 USD AUTHORIZE 纵向交易未执行 | P0 | NOT EXECUTED | `C-paypal-e2e/RESULT.md` |
| B07-P1-01 | 远程 CI、hosted browser matrix、备份恢复/回滚演练未执行 | P1 | DEFERRED | `D-ci-browser/RESULT.md` |
| B07-SAFE-01 | Live Secret 未读取，Live endpoint 未调用 | Safety | PASS WITH SCOPE | `RUN_METADATA.json` |

本矩阵不将本地 deterministic seam、内部 HTTP 200 或现有本地 Docker 运行结果写成 hosted/provider PASS。
