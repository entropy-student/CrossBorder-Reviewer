import * as path from "node:path"

const projectRoot = process.env.PROJECT_ROOT
if (!projectRoot) throw new Error("PROJECT_ROOT is required")

const paypalModule = require(path.join(
  projectRoot,
  "apps/backend/src/modules/paypal/service.ts"
)) as typeof import("../../../../../跨境电商/CrossBorder-Independent-Store/03_template/medusa-crossborder-base/apps/backend/src/modules/paypal/service")

async function officialRefundShapeProbe() {
  let orderLookupCalled = false
  let error = ""
  try {
    await paypalModule.resolvePayPalWebhookAction(
      {
        id: "WH-REFUND-PROBE",
        event_type: "PAYMENT.REFUND.COMPLETED",
        resource: {
          id: "REFUND-PROBE",
          status: "COMPLETED",
          amount: { value: "1.00", currency_code: "USD" },
          supplementary_data: {
            related_ids: { capture_id: "CAPTURE-PROBE" },
          },
        },
      },
      {
        retrieveOrder: async () => {
          orderLookupCalled = true
          throw new Error("unexpected order lookup")
        },
      }
    )
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }

  return {
    accepted: !error,
    order_lookup_called: orderLookupCalled,
    error_category: error.includes("related_ids.order_id")
      ? "requires_order_id_for_refund_resource"
      : error
        ? "other_error"
        : "none",
  }
}

async function replayProbe() {
  let calls = 0
  const reconciliation = {
    recordVerifiedWebhookEvent: async () => {
      calls += 1
      return { replayed: calls > 1, record: { id: "safe", status: "applied" } }
    },
  }
  const transport = {
    verifyWebhook: async () => true,
    retrieveOrder: async () => {
      throw new Error("unexpected order lookup")
    },
  }
  const service = new paypalModule.PayPalPaymentProviderService(
    { paypal_reconciliation: reconciliation },
    {
      enabled: true,
      environment: "sandbox",
      client_id: "fixture-client",
      client_secret: "fixture-secret",
      webhook_id: "fixture-webhook",
      return_url: "https://store.test/api/payment-return",
      cancel_url: "https://store.test/api/payment-return?cancel=1",
      payment_intent: "AUTHORIZE",
      auto_capture: false,
      transport: transport as never,
    }
  )
  const payload = {
    data: {
      id: "WH-REPLAY-PROBE",
      event_type: "PAYMENT.AUTHORIZATION.CREATED",
      resource: {
        id: "AUTH-PROBE",
        custom_id: "payses_probe_123",
        amount: { value: "14.99", currency_code: "USD" },
      },
    },
  }

  const first = await service.getWebhookActionAndData(payload as never)
  const second = await service.getWebhookActionAndData(payload as never)
  return {
    inbox_calls: calls,
    first_action: first.action,
    replay_action: second.action,
    replay_suppressed: second.action === "not_supported",
  }
}

async function officialCapturePersistenceProbe() {
  let persistedEventHasCorrelation = false
  const reconciliation = {
    recordVerifiedWebhookEvent: async (input: { event: Record<string, unknown> }) => {
      const resource = input.event.resource as Record<string, unknown> | undefined
      persistedEventHasCorrelation = typeof resource?.custom_id === "string"
      return { replayed: false, record: { id: "safe", status: "applied" } }
    },
  }
  const transport = {
    verifyWebhook: async () => true,
    retrieveOrder: async () => ({
      order_id: "ORDER-PROBE",
      status: "COMPLETED",
      correlation_id: "payses_probe_123",
      capture_id: "CAPTURE-PROBE",
      capture_status: "COMPLETED",
      amount: "14.99",
      currency_code: "USD",
    }),
  }
  const service = new paypalModule.PayPalPaymentProviderService(
    { paypal_reconciliation: reconciliation },
    {
      enabled: true,
      environment: "sandbox",
      client_id: "fixture-client",
      client_secret: "fixture-secret",
      webhook_id: "fixture-webhook",
      return_url: "https://store.test/api/payment-return",
      cancel_url: "https://store.test/api/payment-return?cancel=1",
      payment_intent: "AUTHORIZE",
      auto_capture: false,
      transport: transport as never,
    }
  )
  const result = await service.getWebhookActionAndData({
    data: {
      id: "WH-CAPTURE-PROBE",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPTURE-PROBE",
        amount: { value: "14.99", currency_code: "USD" },
        supplementary_data: { related_ids: { order_id: "ORDER-PROBE" } },
      },
    },
  } as never)
  return {
    returned_action: result.action,
    returned_session_id: (result.data as Record<string, unknown>)?.session_id,
    persisted_event_has_correlation: persistedEventHasCorrelation,
  }
}

Promise.all([officialRefundShapeProbe(), replayProbe(), officialCapturePersistenceProbe()])
  .then(([refund, replay, officialCapturePersistence]) => {
    process.stdout.write(JSON.stringify({ refund, replay, officialCapturePersistence }, null, 2) + "\n")
  })
  .catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n")
    process.exitCode = 1
  })
