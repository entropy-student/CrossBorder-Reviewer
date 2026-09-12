import type {
  PayPalAuthorizeOrderResponse,
  PayPalCaptureAuthorizationResponse,
  PayPalCreateOrderResponse,
  PayPalRefundCaptureResponse,
  PayPalRetrieveOrderResponse,
  PayPalTransport,
  PayPalUpdateOrderResponse,
  PayPalVoidAuthorizationResponse,
} from "./service"

type PayPalHttpTransportOptions = {
  environment: "sandbox" | "production"
  clientId: string
  clientSecret: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxRetries?: number
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function money(value: unknown): { amount?: string; currency_code?: string } {
  if (!value || typeof value !== "object") return {}
  const source = value as Record<string, unknown>
  return {
    ...(stringValue(source.value) ? { amount: stringValue(source.value) } : {}),
    ...(stringValue(source.currency_code) ? { currency_code: stringValue(source.currency_code) } : {}),
  }
}

function approvalUrl(body: Record<string, unknown>): string | undefined {
  const items = Array.isArray(body.links) ? body.links : []
  const link = items.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).rel === "approve")
  return link && typeof link === "object" ? stringValue((link as Record<string, unknown>).href) : undefined
}

function paymentEvidence(body: Record<string, unknown>) {
  const purchaseUnit = Array.isArray(body.purchase_units) ? body.purchase_units[0] : undefined
  const purchaseUnitRecord = purchaseUnit && typeof purchaseUnit === "object" ? purchaseUnit as Record<string, unknown> : {}
  const payments = purchaseUnit && typeof purchaseUnit === "object" ? (purchaseUnit as Record<string, unknown>).payments : undefined
  const paymentRecord = payments && typeof payments === "object" ? payments as Record<string, unknown> : {}
  const authorizations = Array.isArray(paymentRecord.authorizations) ? paymentRecord.authorizations : []
  const captures = Array.isArray(paymentRecord.captures) ? paymentRecord.captures : []
  const authorization = authorizations[0] && typeof authorizations[0] === "object" ? authorizations[0] as Record<string, unknown> : {}
  const capture = captures[0] && typeof captures[0] === "object" ? captures[0] as Record<string, unknown> : {}
  const rawAmount = capture.amount || authorization.amount || purchaseUnitRecord.amount
  return {
    ...(stringValue(purchaseUnitRecord.custom_id) ? { correlation_id: stringValue(purchaseUnitRecord.custom_id) } : stringValue(purchaseUnitRecord.invoice_id) ? { correlation_id: stringValue(purchaseUnitRecord.invoice_id) } : {}),
    ...(stringValue(authorization.id) ? { authorization_id: stringValue(authorization.id) } : {}),
    ...(stringValue(authorization.status) ? { authorization_status: stringValue(authorization.status) } : {}),
    ...(stringValue(capture.id) ? { capture_id: stringValue(capture.id) } : {}),
    ...(stringValue(capture.status) ? { capture_status: stringValue(capture.status) } : {}),
    ...money(rawAmount),
  }
}

const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504])

class PayPalHttpError extends Error {
  constructor(public readonly status: number, public readonly retryable: boolean) {
    super(`PayPal sandbox request failed with HTTP ${status}.`)
  }
}

const waitForRetry = (attempt: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.min(250 * 2 ** attempt, 1000)))

export class PayPalHttpTransport implements PayPalTransport {
  private readonly baseUrl = "https://api-m.sandbox.paypal.com"
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private tokenCache?: { value: string; expiresAt: number }

  constructor(options: PayPalHttpTransportOptions) {
    if (options.environment !== "sandbox") throw new Error("PayPal live transport is disabled until a separate live-readiness review.")
    this.clientId = options.clientId
    this.clientSecret = options.clientSecret
    this.fetchImpl = options.fetchImpl || fetch
    this.timeoutMs = options.timeoutMs ?? 10000
    this.maxRetries = options.maxRetries ?? 2
  }

  private async accessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30000) return this.tokenCache.value
    const body = await this.request("/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(this.clientId + ":" + this.clientSecret).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    }, false)
    const token = stringValue(body.access_token)
    const expiresIn = Number(body.expires_in)
    if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error("PayPal OAuth response did not contain a valid temporary access token.")
    this.tokenCache = { value: token, expiresAt: Date.now() + expiresIn * 1000 }
    return token
  }

  private async request(pathname: string, init: RequestInit, authenticate = true): Promise<Record<string, unknown>> {
    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const headers = new Headers(init.headers)
        if (authenticate && !headers.has("Authorization")) headers.set("Authorization", "Bearer " + await this.accessToken())
        const response = await this.fetchImpl(this.baseUrl + pathname, { ...init, headers, signal: controller.signal })
        const text = await response.text()
        let body: Record<string, unknown> = {}
        try { body = text ? JSON.parse(text) as Record<string, unknown> : {} } catch { body = {} }
        if (response.ok) return body
        throw new PayPalHttpError(response.status, RETRYABLE_HTTP_STATUSES.has(response.status))
      } catch (error) {
        lastError = error
        const retryable = error instanceof PayPalHttpError ? error.retryable : true
        if (!retryable || attempt >= this.maxRetries) throw error
        await waitForRetry(attempt)
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastError instanceof Error ? lastError : new Error("PayPal request failed.")
  }

  async createOrder(input: Parameters<PayPalTransport["createOrder"]>[0]): Promise<PayPalCreateOrderResponse> {
    const body = await this.request("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": input.idempotency_key, Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: input.intent,
      purchase_units: [{ reference_id: "default", custom_id: input.correlation_id, amount: { currency_code: input.currency_code, value: input.amount } }],
      ...(input.return_url && input.cancel_url
        ? { application_context: { return_url: input.return_url, cancel_url: input.cancel_url, user_action: "CONTINUE" } }
        : {}),
    }),
    })
    const id = stringValue(body.id)
    if (!id || !stringValue(body.status)) throw new Error("PayPal create-order response was malformed.")
    const url = approvalUrl(body)
    return { order_id: id, status: String(body.status), ...(url ? { approval_url: url } : {}) }
  }

  async authorizeOrder(input: Parameters<PayPalTransport["authorizeOrder"]>[0]): Promise<PayPalAuthorizeOrderResponse> {
    const body = await this.request("/v2/checkout/orders/" + encodeURIComponent(input.order_id) + "/authorize", { method: "POST", headers: { "PayPal-Request-Id": input.idempotency_key, Prefer: "return=representation" } })
    const orderId = stringValue(body.id)
    const evidence = paymentEvidence(body)
    if (!orderId || !stringValue(body.status) || !evidence.authorization_id) throw new Error("PayPal authorize response was malformed.")
    return { order_id: orderId, status: String(body.status), authorization_id: evidence.authorization_id, ...(evidence.authorization_status ? { authorization_status: evidence.authorization_status } : {}), ...money({ value: evidence.amount, currency_code: evidence.currency_code }) }
  }

  async captureAuthorization(input: Parameters<PayPalTransport["captureAuthorization"]>[0]): Promise<PayPalCaptureAuthorizationResponse> {
    const body = await this.request("/v2/payments/authorizations/" + encodeURIComponent(input.authorization_id) + "/capture", { method: "POST", headers: { "PayPal-Request-Id": input.idempotency_key, Prefer: "return=representation" } })
    const id = stringValue(body.id)
    if (!id || !stringValue(body.status)) throw new Error("PayPal capture response was malformed.")
    return { capture_id: id, status: String(body.status), ...(stringValue(body.status) ? { capture_status: String(body.status) } : {}), ...money(body.amount) }
  }

  async updateOrder(input: Parameters<PayPalTransport["updateOrder"]>[0]): Promise<PayPalUpdateOrderResponse> {
    await this.request("/v2/checkout/orders/" + encodeURIComponent(input.order_id), { method: "PATCH", headers: { Prefer: "return=representation", "Content-Type": "application/json" }, body: JSON.stringify([{ op: "replace", path: "/purchase_units/@reference_id=='default'/amount", value: { currency_code: input.currency_code, value: input.amount } }]) })
    return {}
  }

  async retrieveOrder(input: Parameters<PayPalTransport["retrieveOrder"]>[0]): Promise<PayPalRetrieveOrderResponse> {
    const body = await this.request("/v2/checkout/orders/" + encodeURIComponent(input.order_id), { method: "GET" })
    const id = stringValue(body.id)
    if (!id || !stringValue(body.status)) throw new Error("PayPal retrieve-order response was malformed.")
    return { order_id: id, status: String(body.status), ...paymentEvidence(body) }
  }

  async voidAuthorization(input: Parameters<PayPalTransport["voidAuthorization"]>[0]): Promise<PayPalVoidAuthorizationResponse> {
    const body = await this.request("/v2/payments/authorizations/" + encodeURIComponent(input.authorization_id) + "/void", { method: "POST", headers: { "PayPal-Request-Id": input.idempotency_key } })
    return { status: String(body.status || "VOIDED") }
  }

  async refundCapture(input: Parameters<PayPalTransport["refundCapture"]>[0]): Promise<PayPalRefundCaptureResponse> {
    const body = await this.request("/v2/payments/captures/" + encodeURIComponent(input.capture_id) + "/refund", { method: "POST", headers: { "PayPal-Request-Id": input.idempotency_key, Prefer: "return=representation", "Content-Type": "application/json" }, body: JSON.stringify({ amount: { currency_code: input.currency_code, value: input.amount } }) })
    const id = stringValue(body.id)
    if (!id || !stringValue(body.status)) throw new Error("PayPal refund response was malformed.")
    return { refund_id: id, status: String(body.status), ...money(body.amount) }
  }

  async verifyWebhook(input: Parameters<PayPalTransport["verifyWebhook"]>[0]): Promise<boolean> {
    const payload = input.payload as { headers?: Record<string, string>; data?: unknown }
    const headers = payload.headers || {}
    const body = await this.request("/v1/notifications/verify-webhook-signature", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auth_algo: headers["paypal-auth-algo"], cert_url: headers["paypal-cert-url"], transmission_id: headers["paypal-transmission-id"], transmission_sig: headers["paypal-transmission-sig"], transmission_time: headers["paypal-transmission-time"], webhook_id: input.webhook_id, webhook_event: payload.data }) })
    return body.verification_status === "SUCCESS"
  }
}
