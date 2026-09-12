# 按批执行，集中独立验收

用户要求一次布置更多工作、一次验收更多内容，以减少交互轮次，尽快达到“独立站正常使用并上线”。

## 总链路

架构/UI 已冻结 → 独立全面 Review【完成】→ 运行安全与本地验收基础【完成】→ BATCH-02/03 交易返修【分项通过】→ BATCH-04 本地支付/CI/加固骨架【分项通过、整批 RETURN】→ BATCH-05 真实集成与部署草案【局部通过、整批 RETURN】→ BATCH-06 Release Candidate 加固【当前】→ Backend 托管与业务事实一次确认 → Preview/Sandbox → 生产部署、Live 小额订单、备份/回滚验收 → 正式上线。

| 批次 | 状态 | 集中验收目标 |
|---|---|---|
| BATCH-01 | PARTIAL PASS | staging/进程/服务安全与统一入口 |
| BATCH-02 | PARTIAL PASS / RETURN | 局部交易、商品、客户流程与 PayPal OAuth |
| BATCH-03 | PARTIAL PASS / RETURN | 本地基础大幅改善；真实库存、CI、客户 PayPal、webhook/退款与 sandbox 未闭合 |
| BATCH-04 | PARTIAL PASS / RETURN | 本地 clean build、31 tests、PayPal transport/UI 骨架、库存计划与基础安全；inbox、sandbox、生产库存、依赖和部署未闭合 |
| BATCH-05 | RETURN | 本地验证/安全骨架通过；支付重放与退款、真实库存、Docker/生产/R2、Node/Vercel/rollback 未闭合；Sandbox OAuth 401 |
| BATCH-06 | 当前 | Docker/生产基础设施、持久支付退款、真实隔离库存与 Store API、Node/CI/Vercel/rollback、条件 Sandbox 纵向闭环 |
| 生产上线批 | 待 BATCH-06 Reviewer PASS 与一次合并外部输入 | Backend host、库存/履约事实、DNS/邮件/政策、Live Secret 轮换、真实小额订单、监控、备份恢复和回滚 |

## 协作规则

1. Reviewer 一次写清整批范围、依赖、门槛和证据，`NEXT_EXECUTOR_TASK.md` 是唯一当前入口。
2. Executor 在同一批中持续完成所有安全独立工作；单项失败不阻塞其他子项，不逐项等待 Reviewer。
3. 整批交付后 Reviewer 集中做真实代码/反例复验，逐项 PASS/RETURN；通过项不会因其他项 RETURN 而丢失。
4. 已有 PayPal sandbox 凭据不重复索要；敏感值不写入报告。用户已粘贴的 Live Secret 视为暴露并禁止使用，上线前必须轮换。需要业务决定时统一写入 USER_ACTION_PACKET，让用户一次回答。
5. 真实生产部署、live 收费、真实发货、数据库删除、commit/push/PR 需要到相应阶段并保持具体证据；当前批不执行。
6. 不重新设计 Medusa/Figma/Web UI，不重新选品，不虚构库存、物流、税务、HS、政策或商户资格。
7. 复用未变化证据，避免重复全面 Review、无意义全量重跑和频繁轮询。

当前以 `CURRENT_STATUS.md` 和 `NEXT_EXECUTOR_TASK.md` 为准。

