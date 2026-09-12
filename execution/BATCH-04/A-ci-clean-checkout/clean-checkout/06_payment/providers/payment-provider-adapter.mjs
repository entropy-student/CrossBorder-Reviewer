/**
 * Provider-neutral payment boundary (readiness/reference only).
 *
 * This module is deliberately not wired to the storefront or Medusa runtime.
 * RUNTIME IMPLEMENTATION CONTRACT = Medusa Payment Module /
 * AbstractPaymentProvider. This file must not become a second runtime payment
 * contract or order orchestration system.
 * The default implementation fails closed so readiness work cannot fabricate
 * a successful payment response.
 */
export const PAYMENT_STATES = Object.freeze([
  "CREATED",
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
])

export class PaymentProviderNotConfiguredError extends Error {
  constructor(providerId = "unknown") {
    super(`Payment provider is not configured: ${providerId}`)
    this.name = "PaymentProviderNotConfiguredError"
  }
}

export class PaymentProviderAdapter {
  constructor({ providerId = "unconfigured", environment = "sandbox" } = {}) {
    this.providerId = providerId
    this.environment = environment
  }

  async createPaymentSession() {
    throw new PaymentProviderNotConfiguredError(this.providerId)
  }

  async getPaymentStatus() {
    throw new PaymentProviderNotConfiguredError(this.providerId)
  }

  async authorizePayment() {
    throw new PaymentProviderNotConfiguredError(this.providerId)
  }

  async capturePayment() {
    throw new PaymentProviderNotConfiguredError(this.providerId)
  }

  async cancelPayment() {
    throw new PaymentProviderNotConfiguredError(this.providerId)
  }

  async refundPayment() {
    throw new PaymentProviderNotConfiguredError(this.providerId)
  }

  verifyWebhook() {
    throw new PaymentProviderNotConfiguredError(this.providerId)
  }

  normalizePaymentEvent() {
    throw new PaymentProviderNotConfiguredError(this.providerId)
  }
}
