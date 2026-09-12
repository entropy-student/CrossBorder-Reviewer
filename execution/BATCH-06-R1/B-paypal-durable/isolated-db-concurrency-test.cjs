const { MedusaAppLoader, container } = require("@medusajs/framework")
const { initializeContainer } = require("@medusajs/medusa/loaders/index")

;(async () => {
  const eventId = process.env.CONCURRENCY_EVENT_ID || `r1-concurrency-${Date.now()}`
  const count = Number(process.env.CONCURRENCY_COUNT || 8)
  const expectReplayOnly = process.env.CONCURRENCY_EXPECT_REPLAY_ONLY === "true"
  await initializeContainer(process.cwd(), { throwOnValidationError: true })
  await new MedusaAppLoader().load({ registerInContainer: true })
  const service = container.resolve("paypal_reconciliation")
  const event = {
    id: eventId,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: `capture-${eventId}`, amount: { value: "14.99", currency_code: "USD" } },
  }

  const calls = await Promise.allSettled(Array.from({ length: count }, () => service.recordVerifiedWebhookEvent({
    event,
    action: "captured",
    medusa_session_id: `session-${eventId}`,
    amount: "14.99",
    currency_code: "USD",
  })))
  const fulfilled = calls.filter((item) => item.status === "fulfilled").map((item) => item.value)
  const rejected = calls.filter((item) => item.status === "rejected")
  const claimed = fulfilled.filter((item) => item.claimed)
  const replayed = fulfilled.filter((item) => item.replayed)
  const providerEventId = fulfilled[0]?.record.provider_event_id
  const rows = providerEventId ? await service.listPayPalEventInboxes({ provider_event_id: providerEventId }) : []
  const sequentialReplay = await service.recordVerifiedWebhookEvent({
    event,
    action: "captured",
    medusa_session_id: `session-${eventId}`,
    amount: "14.99",
    currency_code: "USD",
  })

  console.log(`EVENT_ID_MODE=${process.env.CONCURRENCY_EVENT_ID ? "fixed" : "generated"}`)
  console.log(`CONCURRENCY_COUNT=${count}`)
  console.log(`FULFILLED=${fulfilled.length}`)
  console.log(`REJECTED=${rejected.length}`)
  console.log(`CLAIMED_COUNT=${claimed.length}`)
  console.log(`REPLAYED_COUNT=${replayed.length}`)
  console.log(`DB_ROW_COUNT=${rows.length}`)
  console.log(`SEQUENTIAL_REPLAY=${JSON.stringify({ replayed: sequentialReplay.replayed, claimed: sequentialReplay.claimed, status: sequentialReplay.record.status })}`)
  if (rejected.length) {
    console.log(`REJECTION_TYPES=${rejected.map((item) => item.reason?.name || "Error").join(",")}`)
  }
  const successfulFirstClaim = rejected.length === 0 && claimed.length === 1 && rows.length === 1 && sequentialReplay.replayed
  const successfulRestartReplay = rejected.length === 0 && claimed.length === 0 && replayed.length === count && rows.length === 1 && sequentialReplay.replayed
  process.exit((expectReplayOnly ? successfulRestartReplay : successfulFirstClaim) ? 0 : 1)
})().catch((error) => {
  console.error(error.stack || error)
  process.exit(1)
})
