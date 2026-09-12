import { createHash } from "node:crypto"

import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  PaymentSessionStatus,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { AbstractPaymentProvider, MedusaError } from "@medusajs/framework/utils"
import { PayPalHttpTransport } from "./transport"

export const PAYPAL_PROVIDER_IDENTIFIER = "paypal"
export const PAYPAL_PAYMENT_INTENT = "AUTHORIZE" as const
export const PAYPAL_SUPPORTED_CURRENCY_EXPONENTS = Object.freeze({ USD: 2, EUR: 2 })
export const PAYPAL_REQUEST_ID_MAX_LENGTH = 38

export type PayPalEnvironment = "sandbox" | "production"

export type PayPalProviderOptions = {
  enabled: boolean
  environment: PayPalEnvironment
  client_id?: string
  client_secret?: string
  webhook_id?: string
  return_url?: string
  cancel_url?: string
  auto_capture?: boolean
  payment_intent?: typeof PAYPAL_PAYMENT_INTENT
  /** Test-only transport seam. The runtime default is fail-closed. */
  transport?: PayPalTransport
}

export type PayPalPaymentData = {
  /** The opaque Medusa payment-session identifier. */
  session_id: string
  paypal_order_id: string
  paypal_authorization_id?: string
  paypal_capture_id?: string
  paypal_refund_id?: string
  amount: string
  currency_code: string
  approval_url?: string
  status?: string
  authorization_status?: string
  capture_status?: string
  refund_status?: string
  /** Locally tracked refund total; provider remains the final authority. */
  refunded_amount?: string
  /** Stable Medusa refund operation -> provider evidence, for replay-safe retries. */
  refund_operations?: Record<string, { refund_id: string; amount: string; status: string }>
}

type PayPalOperationInput = {
  data?: Record<string, unknown>
  context?: {
    idempotency_key?: string
  }
}

export type PayPalCreateOrderResponse = {
  order_id: string
  status: string
  approval_url?: string
}

export type PayPalAuthorizeOrderResponse = {
  order_id: string
  status: string
  authorization_id: string
  authorization_status?: string
  amount?: string
  currency_code?: string
}

export type PayPalCaptureAuthorizationResponse = {
  capture_id: string
  status: string
  capture_status?: string
  amount?: string
  currency_code?: string
}

export type PayPalRetrieveOrderResponse = {
  order_id: string
  status: string
  correlation_id?: string
  authorization_id?: string
  authorization_status?: string
  capture_id?: string
  capture_status?: string
  amount?: string
  currency_code?: string
}

export type PayPalUpdateOrderResponse = {
  status?: string
}

export type PayPalVoidAuthorizationResponse = {
  status: string
}

export type PayPalRefundCaptureResponse = {
  refund_id: string
  status: string
  refund_status?: string
  amount?: string
  currency_code?: string
}

export interface PayPalTransport {
  createOrder(input: {
    amount: string
    currency_code: string
    correlation_id: string
    idempotency_key: string
    intent: typeof PAYPAL_PAYMENT_INTENT
    return_url?: string
    cancel_url?: string
  }): Promise<PayPalCreateOrderResponse>
  authorizeOrder(input: {
    order_id: string
    idempotency_key: string
  }): Promise<PayPalAuthorizeOrderResponse>
  captureAuthorization(input: {
    authorization_id: string
    idempotency_key: string
  }): Promise<PayPalCaptureAuthorizationResponse>
  updateOrder(input: {
    order_id: string
    amount: string
    currency_code: string
    /** Local retry/correlation identity; not sent as PayPal-Request-Id for Orders PATCH. */
    operation_id: string
  }): Promise<PayPalUpdateOrderResponse>
  retrieveOrder(input: { order_id: string }): Promise<PayPalRetrieveOrderResponse>
  voidAuthorization(input: {
    authorization_id: string
    idempotency_key: string
  }): Promise<PayPalVoidAuthorizationResponse>
  refundCapture(input: {
    capture_id: string
    amount: string
    currency_code: string
    idempotency_key: string
  }): Promise<PayPalRefundCaptureResponse>
  verifyWebhook(input: {
    payload: ProviderWebhookPayload["payload"]
    webhook_id: string
  }): Promise<boolean>
}

function invalid(message: string): never {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, message)
}

function notAllowed(message: string): never {
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, message)
}

function providerNotReady(operation: string): never {
  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    `PayPal ${operation} is unavailable: the official PayPal transport is not configured. ` +
      "This scaffold fails closed until sandbox eligibility, credentials, and transport integration are reviewed."
  )
}

class FailClosedPayPalTransport implements PayPalTransport {
  private unavailable(operation: string): never {
    return providerNotReady(operation)
  }

  createOrder(): Promise<PayPalCreateOrderResponse> {
    return Promise.reject(this.unavailable("createOrder"))
  }

  authorizeOrder(): Promise<PayPalAuthorizeOrderResponse> {
    return Promise.reject(this.unavailable("authorizeOrder"))
  }

  captureAuthorization(): Promise<PayPalCaptureAuthorizationResponse> {
    return Promise.reject(this.unavailable("captureAuthorization"))
  }

  updateOrder(): Promise<PayPalUpdateOrderResponse> {
    return Promise.reject(this.unavailable("updateOrder"))
  }

  retrieveOrder(): Promise<PayPalRetrieveOrderResponse> {
    return Promise.reject(this.unavailable("retrieveOrder"))
  }

  voidAuthorization(): Promise<PayPalVoidAuthorizationResponse> {
    return Promise.reject(this.unavailable("voidAuthorization"))
  }

  refundCapture(): Promise<PayPalRefundCaptureResponse> {
    return Promise.reject(this.unavailable("refundCapture"))
  }

  verifyWebhook(): Promise<boolean> {
    return Promise.resolve(false)
  }
}

const PAYPAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const SAFE_CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function readDecimalText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : undefined
  if (value && typeof value === "object" && typeof (value as { toString?: unknown }).toString === "function") {
    const text = String(value)
    return text.trim() || undefined
  }
  return undefined
}

export function normalizeCurrency(value: unknown): keyof typeof PAYPAL_SUPPORTED_CURRENCY_EXPONENTS {
  const currency = readString(value)?.toUpperCase()
  if (!currency || !(currency in PAYPAL_SUPPORTED_CURRENCY_EXPONENTS)) {
    return invalid("PayPal currency_code must be one of the supported currencies: USD or EUR.")
  }

  return currency as keyof typeof PAYPAL_SUPPORTED_CURRENCY_EXPONENTS
}

export function normalizeAmount(value: unknown, currencyCode: unknown, fieldName = "amount"): string {
  const currency = normalizeCurrency(currencyCode)
  const text = readDecimalText(value)
  if (!text || !/^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.test(text)) {
    return invalid(`PayPal ${fieldName} must be a positive decimal string.`)
  }

  const [, whole, fractional = ""] = text.match(/^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/) ?? []
  const exponent = PAYPAL_SUPPORTED_CURRENCY_EXPONENTS[currency]
  if (fractional.length > exponent) {
    return invalid(`PayPal ${fieldName} has more decimal places than ${currency} supports.`)
  }

  const minorUnits = BigInt(whole) * 10n ** BigInt(exponent) + BigInt(fractional.padEnd(exponent, "0") || "0")
  if (minorUnits <= 0n) {
    return invalid(`PayPal ${fieldName} must be greater than zero.`)
  }

  const padded = minorUnits.toString().padStart(exponent + 1, "0")
  return `${padded.slice(0, -exponent)}.${padded.slice(-exponent)}`
}

function readCorrelationId(input: PayPalOperationInput): string {
  const data = input.data ?? {}
  const correlationId =
    readString(data.session_id) ??
    readString(data.payment_session_id) ??
    readString(data.medusa_payment_session_id)

  if (!correlationId || !SAFE_CORRELATION_ID_PATTERN.test(correlationId)) {
    return invalid(
      "PayPal payment data must contain the opaque Medusa payment-session identifier supplied in data.session_id."
    )
  }

  return correlationId
}

function readProviderData(data: Record<string, unknown> | undefined): PayPalPaymentData {
  const source = data ?? {}
  const orderId = readString(source.paypal_order_id) ?? readString(source.order_id) ?? readString(source.id)
  const sessionId = readString(source.session_id) ?? readString(source.payment_session_id) ?? readString(source.medusa_payment_session_id)
  const currencyCode = normalizeCurrency(source.currency_code)
  const amount = normalizeAmount(source.amount, currencyCode)

  if (!orderId || !PAYPAL_ID_PATTERN.test(orderId)) {
    return invalid("PayPal payment data is missing a valid paypal_order_id.")
  }
  if (!sessionId || !SAFE_CORRELATION_ID_PATTERN.test(sessionId)) {
    return invalid("PayPal payment data is missing a valid opaque Medusa payment-session identifier.")
  }

  const authorizationId = readString(source.paypal_authorization_id) ?? readString(source.authorization_id)
  const captureId = readString(source.paypal_capture_id) ?? readString(source.capture_id)
  const refundId = readString(source.paypal_refund_id) ?? readString(source.refund_id)
  const authorizationStatus = readString(source.authorization_status)
  const captureStatus = readString(source.capture_status)
  const refundStatus = readString(source.refund_status)
  const refundedAmount = readString(source.refunded_amount)
  const refundOperations = source.refund_operations && typeof source.refund_operations === "object" && !Array.isArray(source.refund_operations)
    ? source.refund_operations as Record<string, { refund_id?: unknown; amount?: unknown; status?: unknown }>
    : undefined

  for (const [name, value] of [
    ["authorization", authorizationId],
    ["capture", captureId],
    ["refund", refundId],
  ] as const) {
    if (value && !PAYPAL_ID_PATTERN.test(value)) {
      return invalid(`PayPal payment data contains an invalid ${name} identifier.`)
    }
  }

  return {
    session_id: sessionId,
    paypal_order_id: orderId,
    ...(authorizationId ? { paypal_authorization_id: authorizationId } : {}),
    ...(captureId ? { paypal_capture_id: captureId } : {}),
    ...(refundId ? { paypal_refund_id: refundId } : {}),
    amount,
    currency_code: currencyCode,
    ...(readString(source.approval_url) ? { approval_url: readString(source.approval_url) } : {}),
    ...(readString(source.status) ? { status: readString(source.status) } : {}),
    ...(authorizationStatus ? { authorization_status: authorizationStatus } : {}),
    ...(captureStatus ? { capture_status: captureStatus } : {}),
    ...(refundStatus ? { refund_status: refundStatus } : {}),
    ...(refundedAmount ? { refunded_amount: normalizeAmount(refundedAmount, currencyCode, "refunded_amount") } : {}),
    ...(refundOperations ? {
      refund_operations: Object.fromEntries(Object.entries(refundOperations).flatMap(([key, value]) => {
        const refundOperationId = readString(value?.refund_id)
        const refundOperationAmount = readString(value?.amount)
        const refundOperationStatus = readString(value?.status)
        if (!SAFE_CORRELATION_ID_PATTERN.test(key) || !refundOperationId || !PAYPAL_ID_PATTERN.test(refundOperationId) || !refundOperationAmount || !refundOperationStatus) return []
        return [[key, { refund_id: refundOperationId, amount: normalizeAmount(refundOperationAmount, currencyCode, "refund operation amount"), status: refundOperationStatus }]]
      })),
    } : {}),
  }
}

function safeData(data: PayPalPaymentData): Record<string, unknown> {
  return {
    session_id: data.session_id,
    paypal_order_id: data.paypal_order_id,
    ...(data.paypal_authorization_id ? { paypal_authorization_id: data.paypal_authorization_id } : {}),
    ...(data.paypal_capture_id ? { paypal_capture_id: data.paypal_capture_id } : {}),
    ...(data.paypal_refund_id ? { paypal_refund_id: data.paypal_refund_id } : {}),
    amount: data.amount,
    currency_code: data.currency_code,
    ...(data.approval_url ? { approval_url: data.approval_url } : {}),
    ...(data.status ? { status: data.status } : {}),
    ...(data.authorization_status ? { authorization_status: data.authorization_status } : {}),
    ...(data.capture_status ? { capture_status: data.capture_status } : {}),
    ...(data.refund_status ? { refund_status: data.refund_status } : {}),
    ...(data.refunded_amount ? { refunded_amount: data.refunded_amount } : {}),
    ...(data.refund_operations ? { refund_operations: data.refund_operations } : {}),
  }
}

function buildBoundedRequestId(seed: string): string {
  // PayPal-Request-Id is a transport header. Keep it deterministic, ASCII-only
  // and below PayPal's documented 38 single-byte-character boundary.
  return `pp-${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`
}

function buildOperationKey(operation: string, sessionId: string, requestId?: string): string {
  if (!SAFE_CORRELATION_ID_PATTERN.test(sessionId)) {
    return invalid("PayPal operation key requires a valid opaque Medusa payment-session identifier.")
  }
  if (requestId !== undefined && (!SAFE_CORRELATION_ID_PATTERN.test(requestId) || requestId.length > 128)) {
    return invalid("PayPal operation idempotency key must be a safe bounded string.")
  }

  const seed = ["paypal", operation, sessionId, requestId ?? ""].join(":")
  return buildBoundedRequestId(seed)
}

export function buildPayPalIdempotencyKey(operation: string, sessionId: string, requestId?: string): string {
  return buildOperationKey(operation, sessionId, requestId)
}

export function buildUpdateOperationIdentity(
  sessionId: string,
  amount: unknown,
  currencyCode: unknown,
  requestId?: string
): string {
  if (!SAFE_CORRELATION_ID_PATTERN.test(sessionId)) {
    return invalid("PayPal update operation requires a valid opaque Medusa payment-session identifier.")
  }
  if (requestId !== undefined && (!SAFE_CORRELATION_ID_PATTERN.test(requestId) || requestId.length > 128)) {
    return invalid("PayPal update operation idempotency key must be a safe bounded string.")
  }

  const currency = normalizeCurrency(currencyCode)
  const normalizedAmount = normalizeAmount(amount, currency)
  return buildBoundedRequestId(
    ["paypal-update", sessionId, currency, normalizedAmount, requestId ?? ""].join(":")
  )
}

function assertOptionalMoney(
  response: { amount?: string; currency_code?: string },
  expectedAmount: string,
  expectedCurrency: string
): void {
  if (response.amount !== undefined || response.currency_code !== undefined) {
    if (response.amount === undefined || response.currency_code === undefined) {
      return invalid("PayPal response must provide both amount and currency when either is present.")
    }
    if (normalizeAmount(response.amount, response.currency_code, "response amount") !== expectedAmount) {
      return invalid("PayPal amount does not match the Medusa payment amount.")
    }
    if (normalizeCurrency(response.currency_code) !== expectedCurrency) {
      return invalid("PayPal currency does not match the Medusa payment currency.")
    }
  }
}

function assertRequiredMoney(
  response: { amount?: string; currency_code?: string },
  expectedAmount: string,
  expectedCurrency: string
): void {
  if (response.amount === undefined || response.currency_code === undefined) {
    return invalid("PayPal response must provide trusted amount and currency evidence.")
  }
  assertOptionalMoney(response, expectedAmount, expectedCurrency)
}

function requirePayPalId(value: unknown, fieldName: string): string {
  const id = readString(value)
  if (!id || !PAYPAL_ID_PATTERN.test(id)) {
    return invalid(`PayPal response is missing a valid ${fieldName}.`)
  }
  return id
}

export function statusFromPayPal(
  value: string,
  operation: string,
  evidence: {
    authorization_id?: string
    authorization_status?: string
    capture_id?: string
    capture_status?: string
  } = {}
): PaymentSessionStatus {
  const normalizedStatus = value.toUpperCase()
  const hasCaptureEvidence = Boolean(evidence.capture_id)
  const hasAuthorizationEvidence = Boolean(evidence.authorization_id)
  const authorizationStatus = evidence.authorization_status?.toUpperCase()
  const captureStatus = evidence.capture_status?.toUpperCase()

  if (hasCaptureEvidence) {
    if (["COMPLETED", "CAPTURED"].includes(captureStatus || "")) return "captured"
    if (["DENIED", "DECLINED", "FAILED"].includes(captureStatus || "")) return "error"
    if (!captureStatus && ["COMPLETED", "CAPTURED"].includes(normalizedStatus)) return "captured"
    return "pending"
  }

  if (hasAuthorizationEvidence) {
    if (["VOIDED", "CANCELED", "CANCELLED"].includes(authorizationStatus || "")) return "canceled"
    if (["DENIED", "DECLINED", "FAILED"].includes(authorizationStatus || "")) return "error"
    if (["AUTHORIZED", "CREATED", "APPROVED", "COMPLETED", ""].includes(authorizationStatus || "")) {
      if (["authorize", "retrieve", "status"].includes(operation)) return "authorized"
    }
  }

  switch (normalizedStatus) {
    case "CREATED":
    case "SAVED":
      return "pending"
    case "APPROVED":
      return "pending_authorization"
    case "AUTHORIZED":
    case "AUTHORIZATION_CREATED":
      return hasAuthorizationEvidence ? "authorized" : "pending_authorization"
    case "COMPLETED":
    case "CAPTURED":
      if (hasAuthorizationEvidence && (operation === "authorize" || operation === "retrieve" || operation === "status")) {
        return "authorized"
      }
      return "pending"
    case "PAYER_ACTION_REQUIRED":
      return "requires_more"
    case "VOIDED":
    case "CANCELED":
    case "CANCELLED":
      return "canceled"
    case "FAILED":
    case "DENIED":
      return "error"
    default:
      return invalid(`Unsupported PayPal status: ${value}`)
  }
}

function dataFromResponse(
  source: PayPalPaymentData,
  status: PaymentSessionStatus,
  response: {
    authorization_id?: string
    authorization_status?: string
    capture_id?: string
    capture_status?: string
    refund_id?: string
    refund_status?: string
    refund_operation?: { key: string; refund_id: string; amount: string; status: string }
    approval_url?: string
  } = {}
): Record<string, unknown> {
  const refundOperations = response.refund_operation
    ? {
        ...(source.refund_operations || {}),
        [response.refund_operation.key]: {
          refund_id: requirePayPalId(response.refund_operation.refund_id, "refund_id"),
          amount: normalizeAmount(response.refund_operation.amount, source.currency_code, "refund operation amount"),
          status: response.refund_operation.status,
        },
      }
    : source.refund_operations
  return safeData({
    ...source,
    ...(response.authorization_id ? { paypal_authorization_id: requirePayPalId(response.authorization_id, "authorization_id") } : {}),
    ...(response.authorization_status ? { authorization_status: response.authorization_status } : {}),
    ...(response.capture_id ? { paypal_capture_id: requirePayPalId(response.capture_id, "capture_id") } : {}),
    ...(response.capture_status ? { capture_status: response.capture_status } : {}),
    ...(response.refund_id ? { paypal_refund_id: requirePayPalId(response.refund_id, "refund_id") } : {}),
    ...(response.refund_status ? { refund_status: response.refund_status } : {}),
    ...(refundOperations ? { refund_operations: refundOperations } : {}),
    ...(response.approval_url ? { approval_url: response.approval_url } : {}),
    status,
  })
}

function readWebhookResource(payload: Record<string, unknown>): Record<string, unknown> {
  const resource = payload.resource
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
    return invalid("PayPal webhook resource is malformed.")
  }
  return resource as Record<string, unknown>
}

function requireWebhookId(payload: Record<string, unknown>, fieldName: string): string {
  const value = readString(payload[fieldName])
  if (!value || !PAYPAL_ID_PATTERN.test(value)) return invalid(`PayPal webhook is missing a valid ${fieldName}.`)
  return value
}

function readWebhookCorrelation(resource: Record<string, unknown>): string {
  const correlationId = readString(resource.custom_id) ?? readString(resource.invoice_id)
  if (!correlationId || !SAFE_CORRELATION_ID_PATTERN.test(correlationId)) {
    return invalid("PayPal webhook is missing a valid opaque Medusa payment-session correlation ID.")
  }
  return correlationId
}

function readRelatedOrderId(resource: Record<string, unknown>): string {
  const supplementary = resource.supplementary_data
  const relatedIds = supplementary && typeof supplementary === "object" && !Array.isArray(supplementary)
    ? (supplementary as Record<string, unknown>).related_ids
    : undefined
  const orderId = relatedIds && typeof relatedIds === "object" && !Array.isArray(relatedIds)
    ? readString((relatedIds as Record<string, unknown>).order_id)
    : undefined
  if (!orderId || !PAYPAL_ID_PATTERN.test(orderId)) {
    return invalid("PayPal webhook is missing supplementary_data.related_ids.order_id.")
  }
  return orderId
}

function readWebhookAmount(resource: Record<string, unknown>): { amount: string; currency_code: string } {
  const rawAmount = resource.amount
  if (!rawAmount || typeof rawAmount !== "object" || Array.isArray(rawAmount)) {
    return invalid("PayPal webhook amount is malformed.")
  }
  const amount = rawAmount as Record<string, unknown>
  const currencyCode = normalizeCurrency(amount.currency_code)
  return {
    amount: normalizeAmount(amount.value, currencyCode, "webhook amount"),
    currency_code: currencyCode,
  }
}

export function mapPayPalWebhookAction(payload: Record<string, unknown>): WebhookActionResult {
  const eventType = readString(payload.event_type)
  if (!eventType) {
    return invalid("PayPal webhook event_type is required.")
  }

  if (eventType === "CHECKOUT.ORDER.APPROVED") {
    return { action: "not_supported" }
  }

  const supportedEvents = new Set([
    "PAYMENT.AUTHORIZATION.CREATED",
    "PAYMENT.AUTHORIZATION.VOIDED",
    "PAYMENT.CAPTURE.COMPLETED",
    "PAYMENT.CAPTURE.DECLINED",
    // Explicit legacy Payments v1 compatibility alias. The canonical v2
    // event is PAYMENT.CAPTURE.DECLINED.
    "PAYMENT.CAPTURE.DENIED",
  ])
  if (!supportedEvents.has(eventType)) {
    return { action: "not_supported" }
  }

  const resource = readWebhookResource(payload)
  const eventId = requireWebhookId(payload, "id")
  const resourceId = requireWebhookId(resource, "id")
  const webhookData = (data: Record<string, unknown>): WebhookActionResult["data"] => ({
    ...data,
    provider_event_id: eventId,
    provider_resource_id: resourceId,
  } as unknown as WebhookActionResult["data"])
  switch (eventType) {
    case "PAYMENT.AUTHORIZATION.CREATED": {
      const sessionId = readWebhookCorrelation(resource)
      const money = readWebhookAmount(resource)
      return { action: "authorized", data: webhookData({ session_id: sessionId, ...money }) }
    }
    case "PAYMENT.AUTHORIZATION.VOIDED": {
      const sessionId = readWebhookCorrelation(resource)
      const money = readWebhookAmount(resource)
      return { action: "canceled", data: webhookData({ session_id: sessionId, ...money }) }
    }
    case "PAYMENT.CAPTURE.COMPLETED": {
      const sessionId = readWebhookCorrelation(resource)
      const money = readWebhookAmount(resource)
      return { action: "captured", data: webhookData({ session_id: sessionId, ...money }) }
    }
    case "PAYMENT.CAPTURE.DECLINED":
    case "PAYMENT.CAPTURE.DENIED": {
      const sessionId = readWebhookCorrelation(resource)
      const money = readWebhookAmount(resource)
      return { action: "failed", data: webhookData({ session_id: sessionId, ...money }) }
    }
    default:
      return { action: "not_supported" }
  }
}

/**
 * Payments v2 capture/authorization webhooks commonly carry the PayPal order
 * relation in supplementary_data.related_ids rather than resource.custom_id.
 * Retrieve that order through the fixed transport before mapping the event so
 * the Medusa session correlation remains evidence-backed.
 */
export async function resolvePayPalWebhookAction(
  payload: Record<string, unknown>,
  transport: Pick<PayPalTransport, "retrieveOrder">
): Promise<WebhookActionResult> {
  const eventType = readString(payload.event_type)
  if (!eventType || eventType === "CHECKOUT.ORDER.APPROVED" || ![
    "PAYMENT.AUTHORIZATION.CREATED",
    "PAYMENT.AUTHORIZATION.VOIDED",
    "PAYMENT.CAPTURE.COMPLETED",
    "PAYMENT.CAPTURE.DECLINED",
    "PAYMENT.CAPTURE.DENIED",
  ].includes(eventType)) {
    return { action: "not_supported" }
  }
  const resource = readWebhookResource(payload)
  let correlationId: string | undefined
  try {
    correlationId = readWebhookCorrelation(resource)
  } catch {
    correlationId = undefined
  }

  if (correlationId) {
    return mapPayPalWebhookAction(payload)
  }

  const relatedOrderId = readRelatedOrderId(resource)
  const retrieved = await transport.retrieveOrder({ order_id: relatedOrderId })
  if (retrieved.order_id !== relatedOrderId || !retrieved.correlation_id) {
    return invalid("PayPal webhook order lookup did not return a trusted payment-session correlation ID.")
  }

  const resourceId = requireWebhookId(resource, "id")
  if (eventType === "PAYMENT.CAPTURE.COMPLETED" || eventType === "PAYMENT.CAPTURE.DECLINED" || eventType === "PAYMENT.CAPTURE.DENIED") {
    if (retrieved.capture_id && retrieved.capture_id !== resourceId) {
      return invalid("PayPal webhook capture resource does not match the retrieved order evidence.")
    }
  }
  if (eventType === "PAYMENT.AUTHORIZATION.CREATED" || eventType === "PAYMENT.AUTHORIZATION.VOIDED") {
    if (retrieved.authorization_id && retrieved.authorization_id !== resourceId) {
      return invalid("PayPal webhook authorization resource does not match the retrieved order evidence.")
    }
  }

  const webhookMoney = readWebhookAmount(resource)
  if (retrieved.amount !== undefined && retrieved.currency_code !== undefined) {
    if (normalizeAmount(retrieved.amount, retrieved.currency_code, "retrieved order amount") !== webhookMoney.amount || normalizeCurrency(retrieved.currency_code) !== webhookMoney.currency_code) {
      return invalid("PayPal webhook amount or currency does not match the retrieved order evidence.")
    }
  }

  return mapPayPalWebhookAction({
    ...payload,
    resource: {
      ...resource,
      custom_id: retrieved.correlation_id,
    },
  })
}

const TEMPLATE_PLACEHOLDER_PATTERN = /^(?:<[^>]+>|.*(?:PLACEHOLDER|SET_LOCALLY|LOCAL_ONLY|GENERATED_BY).*)$/i

function isUsableCredential(value: unknown): boolean {
  const credential = readString(value)
  return Boolean(credential && !TEMPLATE_PLACEHOLDER_PATTERN.test(credential))
}

export function getPayPalProviderOptions(env: NodeJS.ProcessEnv = process.env): PayPalProviderOptions {
  const enabled = env.PAYPAL_PROVIDER_ENABLED?.toLowerCase() === "true"
  const rawEnvironment = env.PAYPAL_ENVIRONMENT?.toLowerCase() || "sandbox"
  if (rawEnvironment !== "sandbox" && rawEnvironment !== "production") {
    return invalid("PAYPAL_ENVIRONMENT must be sandbox or production.")
  }
  if (enabled && rawEnvironment === "production") {
    return invalid("PAYPAL production transport is disabled in this review batch; sandbox is the only allowed environment.")
  }

  const autoCapture = env.PAYPAL_AUTO_CAPTURE?.toLowerCase() === "true"
  if (autoCapture) {
    return invalid("PAYPAL_AUTO_CAPTURE=true is unsupported: the reviewed PayPal path is AUTHORIZE only.")
  }

  const paymentIntent = (env.PAYPAL_PAYMENT_INTENT?.toUpperCase() || PAYPAL_PAYMENT_INTENT) as string
  if (paymentIntent !== PAYPAL_PAYMENT_INTENT) {
    return invalid("PAYPAL_PAYMENT_INTENT must be AUTHORIZE for the reviewed PayPal path.")
  }

  return {
    enabled,
    environment: rawEnvironment as PayPalEnvironment,
    auto_capture: false,
    payment_intent: PAYPAL_PAYMENT_INTENT,
    ...(env.PAYPAL_CLIENT_ID ? { client_id: env.PAYPAL_CLIENT_ID } : {}),
    ...(env.PAYPAL_CLIENT_SECRET ? { client_secret: env.PAYPAL_CLIENT_SECRET } : {}),
    ...(env.PAYPAL_WEBHOOK_ID ? { webhook_id: env.PAYPAL_WEBHOOK_ID } : {}),
  }
}

export class PayPalPaymentProviderService extends AbstractPaymentProvider<PayPalProviderOptions> {
  static identifier = PAYPAL_PROVIDER_IDENTIFIER

  protected readonly options_: PayPalProviderOptions
  protected readonly transport_: PayPalTransport

  static validateOptions(options: PayPalProviderOptions): void {
    if (!options || options.enabled !== true) {
      return invalid("PayPal provider registration requires PAYPAL_PROVIDER_ENABLED=true.")
    }
    if (options.environment !== "sandbox" && options.environment !== "production") {
      return invalid("PAYPAL_ENVIRONMENT must be sandbox or production.")
    }
    if (options.environment === "production") {
      return invalid("PayPal production transport is disabled in this review batch; sandbox is the only allowed environment.")
    }
    if (options.payment_intent !== PAYPAL_PAYMENT_INTENT) {
      return invalid("PAYPAL_PAYMENT_INTENT must be AUTHORIZE for the reviewed PayPal path.")
    }
    if (options.auto_capture === true) {
      return invalid("PAYPAL_AUTO_CAPTURE=true is unsupported: the reviewed PayPal path is AUTHORIZE only.")
    }
    if (!isUsableCredential(options.client_id) || !isUsableCredential(options.client_secret)) {
      return invalid(
        "PayPal client_id and client_secret are required and must not be template placeholders when the provider is enabled."
      )
    }
  }

  constructor(container: Record<string, unknown>, options: PayPalProviderOptions) {
    super(container, options)
    this.options_ = {
      ...options,
      payment_intent: options.payment_intent ?? PAYPAL_PAYMENT_INTENT,
      auto_capture: options.auto_capture ?? false,
    }
    if (this.options_.payment_intent !== PAYPAL_PAYMENT_INTENT || this.options_.auto_capture === true) {
      invalid("PayPal supports only PAYPAL_PAYMENT_INTENT=AUTHORIZE with PAYPAL_AUTO_CAPTURE=false.")
    }
    this.transport_ = options.transport ?? (
      options.enabled === true && options.client_id && options.client_secret
        ? new PayPalHttpTransport({
            environment: options.environment,
            clientId: options.client_id,
            clientSecret: options.client_secret,
          })
        : new FailClosedPayPalTransport()
    )
  }

  getIdentifier(): string {
    return PAYPAL_PROVIDER_IDENTIFIER
  }

  private assertEnabled(operation: string): void {
    if (this.options_.enabled !== true) {
      return notAllowed(`PayPal ${operation} is disabled because PAYPAL_PROVIDER_ENABLED is not true.`)
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    this.assertEnabled("initiatePayment")
    const currencyCode = normalizeCurrency(input.currency_code)
    const amount = normalizeAmount(input.amount, currencyCode)
    const correlationId = readCorrelationId(input)
    const response = await this.transport_.createOrder({
      amount,
      currency_code: currencyCode,
      correlation_id: correlationId,
      idempotency_key: buildOperationKey("create", correlationId),
      intent: PAYPAL_PAYMENT_INTENT,
      ...(this.options_.return_url ? { return_url: this.options_.return_url } : {}),
      ...(this.options_.cancel_url ? { cancel_url: this.options_.cancel_url } : {}),
    })
    const orderId = requirePayPalId(response.order_id, "order_id")
    const status = statusFromPayPal(response.status, "initiate")
    return {
      id: orderId,
      status,
      data: dataFromResponse(
        {
          paypal_order_id: orderId,
          session_id: correlationId,
          amount,
          currency_code: currencyCode,
        },
        status,
        { approval_url: response.approval_url }
      ),
    }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    this.assertEnabled("authorizePayment")
    const source = readProviderData(input.data)
    const response = await this.transport_.authorizeOrder({
      order_id: source.paypal_order_id,
      idempotency_key: buildOperationKey("authorize", source.session_id),
    })
    const orderId = requirePayPalId(response.order_id, "order_id")
    if (orderId !== source.paypal_order_id) {
      return invalid("PayPal authorization response belongs to a different order.")
    }
    const authorizationId = requirePayPalId(response.authorization_id, "authorization_id")
    assertRequiredMoney(response, source.amount, source.currency_code)
    const status = statusFromPayPal(response.status, "authorize", {
      authorization_id: authorizationId,
      authorization_status: response.authorization_status || response.status,
    })
    if (status !== "authorized") {
      return invalid("PayPal authorization response did not provide authorization evidence.")
    }
    return { status, data: dataFromResponse(source, status, { authorization_id: authorizationId, authorization_status: response.authorization_status || response.status }) }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    this.assertEnabled("capturePayment")
    const source = readProviderData(input.data)
    const authorizationId = requirePayPalId(source.paypal_authorization_id, "paypal_authorization_id")
    const response = await this.transport_.captureAuthorization({
      authorization_id: authorizationId,
      idempotency_key: buildOperationKey("capture", source.session_id),
    })
    const captureId = requirePayPalId(response.capture_id, "capture_id")
    assertRequiredMoney(response, source.amount, source.currency_code)
    const status = statusFromPayPal(response.status, "capture", {
      capture_id: captureId,
      capture_status: response.capture_status || response.status,
    })
    if (status === "error") return invalid("PayPal capture response reported a failed capture.")
    return { data: dataFromResponse(source, status, { capture_id: captureId, capture_status: response.capture_status || response.status }) }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    this.assertEnabled("cancelPayment")
    const source = readProviderData(input.data)
    const authorizationId = requirePayPalId(source.paypal_authorization_id, "paypal_authorization_id")
    const response = await this.transport_.voidAuthorization({
      authorization_id: authorizationId,
      idempotency_key: buildOperationKey("cancel", source.session_id),
    })
    const status = statusFromPayPal(response.status, "cancel", { authorization_id: authorizationId })
    if (status !== "canceled") {
      return invalid("PayPal void response did not confirm a canceled authorization.")
    }
    return { data: dataFromResponse(source, status) }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    this.assertEnabled("refundPayment")
    const source = readProviderData(input.data)
    const requestId = readString(input.context?.idempotency_key)
    if (!requestId) {
      return invalid("PayPal refund requires Medusa context.idempotency_key for operation-level idempotency.")
    }
    const refundAmount = normalizeAmount(input.amount, source.currency_code, "refund amount")
    const priorOperation = source.refund_operations?.[requestId]
    if (priorOperation) {
      if (priorOperation.amount !== refundAmount) return invalid("PayPal refund retry changed the amount for the same logical operation.")
      return { data: dataFromResponse(source, priorOperation.status === "COMPLETED" ? "captured" : "pending", { refund_id: priorOperation.refund_id }) }
    }
    const captureId = requirePayPalId(source.paypal_capture_id, "paypal_capture_id")
    const alreadyRefunded = source.refunded_amount
      ? normalizeAmount(source.refunded_amount, source.currency_code, "refunded_amount")
      : "0.00"
    const totalMinor = BigInt(normalizeAmount(source.amount, source.currency_code).replace(".", ""))
    const alreadyRefundedMinor = BigInt(alreadyRefunded.replace(".", ""))
    const refundMinor = BigInt(refundAmount.replace(".", ""))
    if (alreadyRefundedMinor + refundMinor > totalMinor) {
      return invalid("PayPal cumulative refund amount cannot exceed the captured payment amount.")
    }

    const response = await this.transport_.refundCapture({
      capture_id: captureId,
      amount: refundAmount,
      currency_code: source.currency_code,
      idempotency_key: buildOperationKey("refund", source.session_id, requestId),
    })
    const refundId = requirePayPalId(response.refund_id, "refund_id")
    assertRequiredMoney(response, refundAmount, source.currency_code)
    const refundStatus = response.refund_status?.toUpperCase() || response.status.toUpperCase()
    if (["PENDING", "IN_PROGRESS"].includes(refundStatus)) {
      return {
        data: dataFromResponse(source, "pending", {
          refund_id: refundId,
          refund_status: refundStatus,
          refund_operation: { key: requestId, refund_id: refundId, amount: refundAmount, status: refundStatus },
        }),
      }
    }
    if (!["COMPLETED", "CAPTURED"].includes(refundStatus)) {
      return invalid("PayPal refund response did not confirm a completed refund.")
    }
    const nextRefundedMinor = alreadyRefundedMinor + refundMinor
    const nextRefundedText = `${nextRefundedMinor.toString().padStart(3, "0").slice(0, -2)}.${nextRefundedMinor.toString().padStart(3, "0").slice(-2)}`
    return {
      data: dataFromResponse(
        {
          ...source,
          refunded_amount: nextRefundedText,
          refund_operations: {
            ...(source.refund_operations || {}),
            [requestId]: { refund_id: refundId, amount: refundAmount, status: "COMPLETED" },
          },
        },
        "captured",
        { refund_id: refundId, refund_status: refundStatus }
      ),
    }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    this.assertEnabled("updatePayment")
    const source = readProviderData(input.data)
    const currencyCode = normalizeCurrency(input.currency_code)
    const amount = normalizeAmount(input.amount, currencyCode)
    const response = await this.transport_.updateOrder({
      order_id: source.paypal_order_id,
      amount,
      currency_code: currencyCode,
      operation_id: buildUpdateOperationIdentity(
        source.session_id,
        amount,
        currencyCode,
        readString(input.context?.idempotency_key)
      ),
    })
    const status = response.status ? statusFromPayPal(response.status, "update") : undefined
    return {
      ...(status ? { status } : {}),
      data: safeData({ ...source, amount, currency_code: currencyCode, ...(status ? { status } : {}) }),
    }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    this.assertEnabled("retrievePayment")
    const source = readProviderData(input.data)
    const response = await this.transport_.retrieveOrder({ order_id: source.paypal_order_id })
    const orderId = requirePayPalId(response.order_id, "order_id")
    if (orderId !== source.paypal_order_id) {
      return invalid("PayPal retrieve response belongs to a different order.")
    }
    assertRequiredMoney(response, source.amount, source.currency_code)
    const authorizationId = response.authorization_id ? requirePayPalId(response.authorization_id, "authorization_id") : undefined
    const captureId = response.capture_id ? requirePayPalId(response.capture_id, "capture_id") : undefined
    const status = statusFromPayPal(response.status, "retrieve", {
      ...(authorizationId ? { authorization_id: authorizationId } : {}),
      ...(authorizationId ? { authorization_status: response.authorization_status } : {}),
      ...(captureId ? { capture_id: captureId } : {}),
      ...(captureId ? { capture_status: response.capture_status } : {}),
    })
    return {
      data: dataFromResponse(source, status, {
        ...(authorizationId ? { authorization_id: authorizationId } : {}),
        ...(authorizationId ? { authorization_status: response.authorization_status } : {}),
        ...(captureId ? { capture_id: captureId } : {}),
        ...(captureId ? { capture_status: response.capture_status } : {}),
      }),
    }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    // PayPal Orders cannot be deleted through the Orders API. Returning only the
    // previously stored safe identifiers is the documented Medusa fallback.
    if (!input.data) return {}
    return { data: safeData(readProviderData(input.data)) }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    this.assertEnabled("getPaymentStatus")
    const source = readProviderData(input.data)
    const response = await this.transport_.retrieveOrder({ order_id: source.paypal_order_id })
    const orderId = requirePayPalId(response.order_id, "order_id")
    if (orderId !== source.paypal_order_id) return invalid("PayPal status response belongs to a different order.")
    assertRequiredMoney(response, source.amount, source.currency_code)
    const authorizationId = response.authorization_id ? requirePayPalId(response.authorization_id, "authorization_id") : undefined
    const captureId = response.capture_id ? requirePayPalId(response.capture_id, "capture_id") : undefined
    const status = statusFromPayPal(response.status, "status", {
      ...(authorizationId ? { authorization_id: authorizationId } : {}),
      ...(authorizationId ? { authorization_status: response.authorization_status } : {}),
      ...(captureId ? { capture_id: captureId } : {}),
      ...(captureId ? { capture_status: response.capture_status } : {}),
    })
    return {
      status,
      data: dataFromResponse(source, status, {
        ...(authorizationId ? { authorization_id: authorizationId } : {}),
        ...(authorizationId ? { authorization_status: response.authorization_status } : {}),
        ...(captureId ? { capture_id: captureId } : {}),
        ...(captureId ? { capture_status: response.capture_status } : {}),
      }),
    }
  }

  async getWebhookActionAndData(
    webhookData: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    this.assertEnabled("webhook")
    if (!this.options_.webhook_id) {
      return invalid("PayPal webhook verification is unavailable without PAYPAL_WEBHOOK_ID.")
    }
    const verified = await this.transport_.verifyWebhook({ payload: webhookData, webhook_id: this.options_.webhook_id })
    if (!verified) {
      return notAllowed("PayPal webhook signature verification failed.")
    }
    return resolvePayPalWebhookAction(webhookData.data, this.transport_)
  }
}

export default PayPalPaymentProviderService
