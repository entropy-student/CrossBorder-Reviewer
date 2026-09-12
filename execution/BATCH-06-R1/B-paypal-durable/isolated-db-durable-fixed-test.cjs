const { MedusaAppLoader, container } = require("@medusajs/framework")
const { initializeContainer } = require("@medusajs/medusa/loaders/index")

;(async () => {
  const startedAt = Date.now()
  await initializeContainer(process.cwd(), { throwOnValidationError: true })
  const app = await new MedusaAppLoader().load({ registerInContainer: true })
  const service = container.resolve("paypal_reconciliation")
  const eventId = `r1-local-durable-webhook-${startedAt}`
  const sessionId = `r1-local-session-${startedAt}`
  const event = {
    id: eventId,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: `r1-local-capture-${startedAt}`,
      amount: { value: "14.99", currency_code: "USD" },
      custom_id: sessionId,
    },
  }

  const first = await service.recordVerifiedWebhookEvent({
    event,
    action: "captured",
    medusa_session_id: sessionId,
    amount: "14.99",
    currency_code: "USD",
  })
  const replay = await service.recordVerifiedWebhookEvent({
    event,
    action: "captured",
    medusa_session_id: sessionId,
    amount: "14.99",
    currency_code: "USD",
  })
  const dispatched = await service.markDispatchRequested(first.record.id)
  const applied = await service.markAppliedAfterMedusaReadback(first.record.id, "captured")

  const operationKey = `r1-local-refund-operation-${startedAt}`
  await service.createPayPalPaymentOperations([{
    operation_key: operationKey,
    operation_type: "refund",
    status: "pending",
    paypal_order_id: `r1-local-order-${startedAt}`,
    paypal_capture_id: `r1-local-capture-${startedAt}`,
    medusa_session_id: sessionId,
    amount: "14.99",
    currency_code: "USD",
    safe_metadata: { source: "local-durable-db-check" },
  }])
  const refund = await service.reconcileRefundOperation({
    operation_key: operationKey,
    refund_id: `r1-local-refund-${startedAt}`,
    retrieveRefund: async ({ refund_id }) => ({ refund_id, status: "COMPLETED" }),
  })
  const operations = await service.listPayPalPaymentOperations({ operation_key: operationKey })
  const inbox = await service.listPayPalEventInboxes({ id: first.record.id })

  console.log("MODULE_LOADED=paypal_reconciliation")
  console.log(`WEBHOOK_FIRST=${JSON.stringify({ replayed: first.replayed, claimed: first.claimed, status: first.record.status })}`)
  console.log(`WEBHOOK_REPLAY=${JSON.stringify({ replayed: replay.replayed, claimed: replay.claimed, status: replay.record.status })}`)
  console.log(`WEBHOOK_LIFECYCLE=${[dispatched.status, applied.status].join(">")}`)
  console.log(`REFUND_READBACK=${JSON.stringify(refund)}`)
  console.log(`REFUND_DB_STATUS=${operations[0].status}`)
  console.log(`INBOX_DB_STATUS=${inbox[0].status}`)
  console.log(`REDIS_URL_PRESENT=${Boolean(process.env.REDIS_URL)}`)

  // This is a one-shot evidence process; the container is removed by the executor.
  process.exit(0)

  await app.onApplicationPrepareShutdown()
  await app.onApplicationShutdown()
  const pg = container.resolve("__pg_connection__")
  await pg.context.destroy()
})().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
