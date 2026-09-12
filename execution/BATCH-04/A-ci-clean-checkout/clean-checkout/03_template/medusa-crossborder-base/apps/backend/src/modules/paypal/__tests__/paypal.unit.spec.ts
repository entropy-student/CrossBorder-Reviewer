import {
  buildPayPalIdempotencyKey,
  buildUpdateOperationIdentity,
  getPayPalProviderOptions,
  mapPayPalWebhookAction,
  normalizeAmount,
  normalizeCurrency,
  PayPalPaymentProviderService,
  resolvePayPalWebhookAction,
  type PayPalTransport,
} from "../service"
import { PayPalHttpTransport } from "../transport"

// Read-only evidence from the installed Medusa 2.19.0 local database. The
// provider treats this as an opaque identifier; the payses_ spelling is not a
// runtime validation rule.
const sessionId = "payses_01M1JFGVSRR38ATE39EFYPPPKF"
const baseData = {
  session_id: sessionId,
  paypal_order_id: "ORDER-123",
  paypal_capture_id: "CAPTURE-123",
  paypal_authorization_id: "AUTH-123",
  amount: "14.99",
  currency_code: "USD",
}

function transport(overrides: Partial<PayPalTransport> = {}): PayPalTransport {
  return {
    createOrder: jest.fn(async () => ({ order_id: "ORDER-123", status: "CREATED", approval_url: "https://paypal.test/approve" })),
    authorizeOrder: jest.fn(async () => ({
      order_id: "ORDER-123",
      status: "AUTHORIZED",
      authorization_id: "AUTH-123",
      amount: "14.99",
      currency_code: "USD",
    })),
    captureAuthorization: jest.fn(async () => ({
      capture_id: "CAPTURE-123",
      status: "COMPLETED",
      amount: "14.99",
      currency_code: "USD",
    })),
    updateOrder: jest.fn(async () => ({ status: "APPROVED" })),
    retrieveOrder: jest.fn(async () => ({
      order_id: "ORDER-123",
      status: "AUTHORIZED",
      authorization_id: "AUTH-123",
      amount: "14.99",
      currency_code: "USD",
    })),
    voidAuthorization: jest.fn(async () => ({ status: "VOIDED" })),
    refundCapture: jest.fn(async () => ({
      refund_id: "REFUND-123",
      status: "COMPLETED",
      amount: "5.00",
      currency_code: "USD",
    })),
    verifyWebhook: jest.fn(async () => true),
    ...overrides,
  }
}

function enabledService(fakeTransport: PayPalTransport, extra: Record<string, unknown> = {}) {
  return new PayPalPaymentProviderService(
    {},
    {
      enabled: true,
      environment: "sandbox",
      client_id: "sandbox-client",
      client_secret: "local-only-secret",
      webhook_id: "local-webhook-id",
      payment_intent: "AUTHORIZE",
      auto_capture: false,
      transport: fakeTransport,
      ...extra,
    }
  )
}

describe("PayPal provider scaffold", () => {
  it("keeps the provider disabled without requiring credentials", () => {
    expect(
      getPayPalProviderOptions({ PAYPAL_PROVIDER_ENABLED: "false", PAYPAL_ENVIRONMENT: "sandbox" })
    ).toEqual({ enabled: false, environment: "sandbox", auto_capture: false, payment_intent: "AUTHORIZE" })
  })

  it("does not call an injected transport while disabled", async () => {
    const fakeTransport = transport()
    const service = new PayPalPaymentProviderService(
      {},
      { enabled: false, environment: "sandbox", transport: fakeTransport }
    )

    await expect(
      service.initiatePayment({ amount: "14.99", currency_code: "USD", data: { session_id: sessionId } })
    ).rejects.toThrow("disabled")
    expect(fakeTransport.createOrder).not.toHaveBeenCalled()
  })

  it("fails closed for unsupported auto-capture and payment intent values", () => {
    expect(() => getPayPalProviderOptions({ PAYPAL_AUTO_CAPTURE: "true" })).toThrow("AUTHORIZE only")
    expect(() => getPayPalProviderOptions({ PAYPAL_PAYMENT_INTENT: "CAPTURE" })).toThrow("AUTHORIZE")
    expect(() =>
      PayPalPaymentProviderService.validateOptions({
        enabled: true,
        environment: "sandbox",
        client_id: "id",
        client_secret: "secret",
        auto_capture: true,
        payment_intent: "AUTHORIZE",
      })
    ).toThrow("AUTHORIZE only")
  })

  it("fails closed when the enabled provider receives untouched template credentials", () => {
    const options = getPayPalProviderOptions({
      PAYPAL_PROVIDER_ENABLED: "true",
      PAYPAL_ENVIRONMENT: "sandbox",
      PAYPAL_PAYMENT_INTENT: "AUTHORIZE",
      PAYPAL_AUTO_CAPTURE: "false",
      PAYPAL_CLIENT_ID: "<LOCAL_ONLY_SANDBOX_PLACEHOLDER>",
      PAYPAL_CLIENT_SECRET: "<LOCAL_ONLY_SANDBOX_PLACEHOLDER>",
    })

    expect(() => PayPalPaymentProviderService.validateOptions(options)).toThrow("template placeholders")
  })

  it("uses an opaque Medusa session ID and freezes create intent to AUTHORIZE", async () => {
    const fakeTransport = transport()
    const service = enabledService(fakeTransport)
    const result = await service.initiatePayment({
      amount: "14.99",
      currency_code: "USD",
      data: { session_id: sessionId },
    })

    expect(result.id).toBe("ORDER-123")
    expect(result.data).toMatchObject({ session_id: sessionId, paypal_order_id: "ORDER-123" })
    expect(fakeTransport.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ correlation_id: sessionId, intent: "AUTHORIZE" })
    )
  })

  it("uses authorization ID for capture and preserves operation-specific responses", async () => {
    const fakeTransport = transport()
    const service = enabledService(fakeTransport)

    const authorized = await service.authorizePayment({ data: baseData })
    expect(authorized.status).toBe("authorized")
    expect(authorized.data).toMatchObject({ paypal_authorization_id: "AUTH-123" })

    const captured = await service.capturePayment({ data: authorized.data as Record<string, unknown> })
    expect(captured.data).toMatchObject({ paypal_capture_id: "CAPTURE-123", status: "captured" })
    expect(fakeTransport.captureAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ authorization_id: "AUTH-123" })
    )

    await service.cancelPayment({ data: baseData })
    await service.updatePayment({ amount: "12.50", currency_code: "USD", data: baseData })
    await service.retrievePayment({ data: baseData })
    expect(fakeTransport.voidAuthorization).toHaveBeenCalled()
    expect(fakeTransport.updateOrder).toHaveBeenCalled()
    expect(fakeTransport.retrieveOrder).toHaveBeenCalled()
  })

  it("reconciles status evidence through getPaymentStatus and retrievePayment", async () => {
    const readStatus = async (response: Awaited<ReturnType<PayPalTransport["retrieveOrder"]>>) => {
      const fakeTransport = transport({ retrieveOrder: jest.fn(async () => response) })
      const service = enabledService(fakeTransport)
      const data = { ...baseData, paypal_authorization_id: undefined, paypal_capture_id: undefined }
      const statusResult = await service.getPaymentStatus({ data })
      const retrieveResult = await service.retrievePayment({ data })
      return { status: statusResult.status, retrieved: retrieveResult.data?.status }
    }

    await expect(
      readStatus({
        order_id: "ORDER-123",
        status: "COMPLETED",
        authorization_id: "AUTH-123",
        amount: "14.99",
        currency_code: "USD",
      })
    ).resolves.toEqual({ status: "authorized", retrieved: "authorized" })
    await expect(
      readStatus({
        order_id: "ORDER-123",
        status: "COMPLETED",
        capture_id: "CAPTURE-123",
        amount: "14.99",
        currency_code: "USD",
      })
    ).resolves.toEqual({ status: "captured", retrieved: "captured" })
    await expect(
      readStatus({
        order_id: "ORDER-123",
        status: "COMPLETED",
        amount: "14.99",
        currency_code: "USD",
      })
    ).resolves.toEqual({ status: "pending", retrieved: "pending" })
    await expect(
      readStatus({
        order_id: "ORDER-123",
        status: "APPROVED",
        amount: "14.99",
        currency_code: "USD",
      })
    ).resolves.toEqual({ status: "pending_authorization", retrieved: "pending_authorization" })
  })

  it("uses explicit USD/EUR decimal handling without floating-point rounding", () => {
    expect(normalizeCurrency("USD")).toBe("USD")
    expect(normalizeCurrency("EUR")).toBe("EUR")
    expect(normalizeAmount("14.99", "USD")).toBe("14.99")
    expect(normalizeAmount("0.01", "USD")).toBe("0.01")
    expect(normalizeAmount("999999999999999999.99", "USD")).toBe("999999999999999999.99")
    expect(() => normalizeCurrency("JPY")).toThrow("USD or EUR")
    expect(() => normalizeAmount("1.001", "USD")).toThrow("decimal places")
    expect(() => normalizeAmount("-1", "USD")).toThrow("positive")
    expect(() => normalizeAmount("1e2", "USD")).toThrow("positive")
    expect(() => normalizeAmount("0", "USD")).toThrow("greater than zero")
  })

  it("rejects response money mismatches", async () => {
    const fakeTransport = transport({
      authorizeOrder: jest.fn(async () => ({
        order_id: "ORDER-123",
        status: "AUTHORIZED",
        authorization_id: "AUTH-123",
        amount: "15.00",
        currency_code: "USD",
      })),
    })
    await expect(enabledService(fakeTransport).authorizePayment({ data: baseData })).rejects.toThrow("does not match")
  })

  it("uses the same refund key for a retry and distinct keys for distinct refunds", async () => {
    const fakeTransport = transport({
      refundCapture: jest.fn(async (input) => ({
        refund_id: "REFUND-123",
        status: "COMPLETED",
        amount: input.amount,
        currency_code: input.currency_code,
      })),
    })
    const service = enabledService(fakeTransport)
    await service.refundPayment({ amount: "5.00", data: baseData, context: { idempotency_key: "refund-a" } })
    await service.refundPayment({ amount: "5.00", data: baseData, context: { idempotency_key: "refund-a" } })
    await service.refundPayment({ amount: "4.00", data: baseData, context: { idempotency_key: "refund-b" } })

    const calls = (fakeTransport.refundCapture as jest.Mock).mock.calls
    expect(calls[0][0].idempotency_key).toBe(calls[1][0].idempotency_key)
    expect(calls[0][0].idempotency_key).not.toBe(calls[2][0].idempotency_key)
  })

  it("bounds locally represented cumulative refunds", async () => {
    const fakeTransport = transport()
    const service = enabledService(fakeTransport)
    await expect(
      service.refundPayment({
        amount: "5.00",
        data: { ...baseData, refunded_amount: "10.00" },
        context: { idempotency_key: "refund-over" },
      })
    ).rejects.toThrow("cumulative refund")
    expect(fakeTransport.refundCapture).not.toHaveBeenCalled()
  })

  it("replays a completed refund from stored operation evidence without a second transport call", async () => {
    const fakeTransport = transport()
    const service = enabledService(fakeTransport)
    const first = await service.refundPayment({ amount: "5.00", data: baseData, context: { idempotency_key: "refund-a" } })
    const second = await service.refundPayment({ amount: "5.00", data: first.data as Record<string, unknown>, context: { idempotency_key: "refund-a" } })
    expect(second.data).toMatchObject({ paypal_refund_id: "REFUND-123", refunded_amount: "5.00" })
    expect(fakeTransport.refundCapture).toHaveBeenCalledTimes(1)
  })

  it("keeps a pending refund pending and replays its operation evidence", async () => {
    const fakeTransport = transport({
      refundCapture: jest.fn(async (input) => ({
        refund_id: "REFUND-PENDING",
        status: "PENDING",
        refund_status: "PENDING",
        amount: input.amount,
        currency_code: input.currency_code,
      })),
    })
    const service = enabledService(fakeTransport)
    const first = await service.refundPayment({
      amount: "5.00",
      data: baseData,
      context: { idempotency_key: "refund-pending" },
    })
    const second = await service.refundPayment({
      amount: "5.00",
      data: first.data as Record<string, unknown>,
      context: { idempotency_key: "refund-pending" },
    })

    expect(first.data).toMatchObject({
      refund_status: "PENDING",
      status: "pending",
    })
    expect((first.data as Record<string, unknown>).refunded_amount).toBeUndefined()
    expect(second.data).toMatchObject({
      refund_status: "PENDING",
      status: "pending",
    })
    expect(fakeTransport.refundCapture).toHaveBeenCalledTimes(1)
  })

  it("rejects a status response for a different PayPal order", async () => {
    const fakeTransport = transport({ retrieveOrder: jest.fn(async () => ({ order_id: "OTHER-ORDER", status: "AUTHORIZED", authorization_id: "AUTH-123", amount: "14.99", currency_code: "USD" })) })
    await expect(enabledService(fakeTransport).getPaymentStatus({ data: baseData })).rejects.toThrow("different order")
  })

  it("maps sandbox transport fixtures without making an external request", async () => {
    const responses = [
      { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "fixture-token", expires_in: 3600 }) },
      { ok: true, status: 201, text: async () => JSON.stringify({ id: "ORDER-123", status: "CREATED", links: [{ rel: "approve", href: "https://sandbox.test/approve" }] }) },
    ]
    const fetchImpl = jest.fn(async () => responses.shift() as never)
    const sandbox = new PayPalHttpTransport({ environment: "sandbox", clientId: "fixture-client", clientSecret: "fixture-secret", fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(sandbox.createOrder({ amount: "14.99", currency_code: "USD", correlation_id: sessionId, idempotency_key: "pp-fixture-create", intent: "AUTHORIZE" })).resolves.toMatchObject({ order_id: "ORDER-123", approval_url: "https://sandbox.test/approve" })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[1][0]).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders")
    expect(new Headers(calls[1][1].headers).get("Content-Type")).toBe("application/json")
  })

  it("does not retry non-retryable HTTP errors", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 400, text: async () => "invalid" }))
    const sandbox = new PayPalHttpTransport({ environment: "sandbox", clientId: "fixture-client", clientSecret: "fixture-secret", fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 2 })
    await expect(sandbox.createOrder({ amount: "14.99", currency_code: "USD", correlation_id: sessionId, idempotency_key: "pp-fixture-create", intent: "AUTHORIZE" })).rejects.toThrow("HTTP 400")
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("bounds retries for transient HTTP errors", async () => {
    const responses = [
      { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "fixture-token", expires_in: 3600 }) },
      { ok: false, status: 503, text: async () => "temporary" },
      { ok: false, status: 503, text: async () => "temporary" },
      { ok: false, status: 503, text: async () => "temporary" },
    ]
    const fetchImpl = jest.fn(async () => responses.shift() as never)
    const sandbox = new PayPalHttpTransport({
      environment: "sandbox",
      clientId: "fixture-client",
      clientSecret: "fixture-secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 2,
    })

    await expect(
      sandbox.createOrder({
        amount: "14.99",
        currency_code: "USD",
        correlation_id: sessionId,
        idempotency_key: "pp-fixture-retry",
        intent: "AUTHORIZE",
      })
    ).rejects.toThrow("HTTP 503")
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it("requires a Medusa idempotency key for refund operations", async () => {
    await expect(enabledService(transport()).refundPayment({ amount: "1.00", data: baseData })).rejects.toThrow(
      "context.idempotency_key"
    )
  })

  it("restricts actionable webhooks to payment authorization/capture events", () => {
    const authorization = mapPayPalWebhookAction({
      id: "EVENT-AUTH",
      event_type: "PAYMENT.AUTHORIZATION.CREATED",
      resource: {
        id: "AUTH-123",
        custom_id: sessionId,
        amount: { value: "14.99", currency_code: "USD" },
      },
    })
    const capture = mapPayPalWebhookAction({
      id: "EVENT-CAPTURE",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPTURE-123",
        custom_id: sessionId,
        amount: { value: "14.99", currency_code: "USD" },
      },
    })
    const declined = mapPayPalWebhookAction({
      id: "EVENT-DECLINED",
      event_type: "PAYMENT.CAPTURE.DECLINED",
      resource: {
        id: "CAPTURE-DECLINED",
        custom_id: sessionId,
        amount: { value: "14.99", currency_code: "USD" },
      },
    })
    const legacyDenied = mapPayPalWebhookAction({
      id: "EVENT-DENIED",
      event_type: "PAYMENT.CAPTURE.DENIED",
      resource: {
        id: "CAPTURE-DENIED",
        custom_id: sessionId,
        amount: { value: "14.99", currency_code: "USD" },
      },
    })
    const approved = mapPayPalWebhookAction({ event_type: "CHECKOUT.ORDER.APPROVED", resource: {} })
    const unknown = mapPayPalWebhookAction({ event_type: "PAYMENT.UNKNOWN" })

    expect(authorization.action).toBe("authorized")
    expect(capture.action).toBe("captured")
    expect(declined.action).toBe("failed")
    expect(legacyDenied.action).toBe("failed")
    expect(approved.action).toBe("not_supported")
    expect(unknown.action).toBe("not_supported")
  })

  it("fails closed on malformed or uncorrelated webhook resources", () => {
    expect(() => mapPayPalWebhookAction({ id: "EVENT-MISSING", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAPTURE-MISSING" } })).toThrow(
      "correlation"
    )
    expect(() =>
      mapPayPalWebhookAction({
        id: "EVENT-JPY",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { id: "CAPTURE-JPY", custom_id: sessionId, amount: { value: "14.99", currency_code: "JPY" } },
      })
    ).toThrow("USD or EUR")
  })

  it("resolves the official Payments v2 related order shape before mapping", async () => {
    const fakeTransport = transport({
      retrieveOrder: jest.fn(async () => ({
        order_id: "ORDER-123",
        status: "COMPLETED",
        correlation_id: sessionId,
        capture_id: "CAPTURE-OFFICIAL",
        amount: "14.99",
        currency_code: "USD",
      })),
    })

    const result = await resolvePayPalWebhookAction({
      id: "EVENT-OFFICIAL",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPTURE-OFFICIAL",
        amount: { value: "14.99", currency_code: "USD" },
        supplementary_data: { related_ids: { order_id: "ORDER-123" } },
      },
    }, fakeTransport)

    expect(result.action).toBe("captured")
    expect(result.data).toMatchObject({ session_id: sessionId })
    expect(fakeTransport.retrieveOrder).toHaveBeenCalledWith({ order_id: "ORDER-123" })
  })

  it("rejects an invalid webhook signature before mapping", async () => {
    const fakeTransport = transport({ verifyWebhook: jest.fn(async () => false) })
    await expect(
      enabledService(fakeTransport).getWebhookActionAndData({
        data: { event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} },
      } as never)
    ).rejects.toThrow("signature")
  })

  it("keeps provider secrets out of safe payment data", async () => {
    const result = await enabledService(transport()).initiatePayment({
      amount: "14.99",
      currency_code: "USD",
      data: { session_id: sessionId },
    })
    expect(result.data).not.toHaveProperty("client_secret")
    expect(result.data).not.toHaveProperty("access_token")
  })

  it("derives stable operation keys from opaque session and operation identity", () => {
    const retryKey = buildPayPalIdempotencyKey("refund", sessionId, "refund-a")
    expect(retryKey).toBe(buildPayPalIdempotencyKey("refund", sessionId, "refund-a"))
    expect(retryKey).not.toBe(buildPayPalIdempotencyKey("capture", sessionId))
    expect(retryKey).not.toBe(buildPayPalIdempotencyKey("refund", sessionId, "refund-b"))
    expect(retryKey).toMatch(/^[\x00-\x7F]+$/)
    expect(retryKey.length).toBeLessThanOrEqual(38)
  })

  it("keeps update operation identity stable without treating Orders PATCH as PayPal-Request-Id", () => {
    const retry = buildUpdateOperationIdentity(sessionId, "14.99", "USD", "update-a")
    expect(retry).toBe(buildUpdateOperationIdentity(sessionId, "14.99", "USD", "update-a"))
    expect(retry).not.toBe(buildUpdateOperationIdentity(sessionId, "12.50", "USD", "update-a"))
    expect(retry).not.toBe(buildUpdateOperationIdentity(sessionId, "14.99", "USD", "update-b"))
    expect(retry.length).toBeLessThanOrEqual(38)
  })

  it("preserves webhook headers, raw body and parsed data at the verification seam", async () => {
    const headers = { "paypal-transmission-id": "tx-local", "paypal-cert-url": "https://local.test/cert" }
    const rawData = '{"event_type":"PAYMENT.AUTHORIZATION.CREATED"}'
    const data = {
      id: "EVENT-SEAM",
      event_type: "PAYMENT.AUTHORIZATION.CREATED",
      resource: { id: "AUTH-SEAM", custom_id: sessionId, amount: { value: "14.99", currency_code: "USD" } },
    }
    const verifyWebhook = jest.fn(async ({ payload }: { payload: { headers: unknown; rawData: unknown; data: unknown } }) => {
      expect(payload.headers).toBe(headers)
      expect(payload.rawData).toBe(rawData)
      expect(payload.data).toBe(data)
      return true
    })

    const result = await enabledService(transport({ verifyWebhook })).getWebhookActionAndData({
      headers,
      rawData,
      data,
    } as never)

    expect(result.action).toBe("authorized")
    expect(verifyWebhook).toHaveBeenCalledTimes(1)
  })
})
