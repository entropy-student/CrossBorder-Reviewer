/**
 * Customer checkout must never expose technical Medusa fixtures by default.
 *
 * NEXT_PUBLIC_CHECKOUT_EXPOSURE_MODE=technical_test is an explicit local-only
 * opt-in for UI smoke work. The default is the safe customer-facing mode.
 */
export type CheckoutExposureMode = "customer" | "technical_test" | "paypal_sandbox_test"

export const checkoutExposureMode: CheckoutExposureMode =
  process.env.NEXT_PUBLIC_CHECKOUT_EXPOSURE_MODE === "technical_test"
    ? "technical_test"
    : process.env.NEXT_PUBLIC_CHECKOUT_EXPOSURE_MODE === "paypal_sandbox_test"
      ? "paypal_sandbox_test"
      : "customer"

export const technicalTestCheckoutEnabled =
  checkoutExposureMode === "technical_test"

export const paypalSandboxCheckoutEnabled =
  checkoutExposureMode === "paypal_sandbox_test"

export const isSystemPaymentProvider = (providerId?: string | null) =>
  Boolean(providerId?.startsWith("pp_system_default"))

export const isStripeLikePaymentProvider = (providerId?: string | null) =>
  Boolean(
    providerId?.startsWith("pp_stripe_") ||
      providerId?.startsWith("pp_stripe-") ||
      providerId === "pp_medusa-payments_default"
  )

/**
 * PayPal has a display mapping in the starter, but no reviewed adapter,
 * redirect/return flow or webhook implementation in this project yet.
 * Keep the customer gate explicit and fail closed until that path is built
 * and sandbox-reviewed.
 */
export const paypalCustomerCheckoutEnabled = paypalSandboxCheckoutEnabled

export const isPaypalPaymentProvider = (providerId?: string | null) =>
  Boolean(providerId?.startsWith("pp_paypal"))

/**
 * Only providers with an implemented customer checkout path are exposed.
 * PayPal/other providers stay hidden until their button/redirect/webhook path
 * is explicitly implemented and reviewed.
 */
export const isCustomerPaymentProviderAllowed = (
  providerId?: string | null
) => {
  if (!providerId) {
    return false
  }

  if (isSystemPaymentProvider(providerId)) {
    return technicalTestCheckoutEnabled
  }

  if (isPaypalPaymentProvider(providerId)) {
    return paypalCustomerCheckoutEnabled
  }

  return isStripeLikePaymentProvider(providerId)
}

export const isTechnicalTestShippingOption = (option: unknown) => {
  const candidate = (option || {}) as {
    provider_id?: string | null
    metadata?: Record<string, unknown> | null
    type?: { code?: string | null; description?: string | null } | null
  }
  const code = candidate.type?.code?.toLowerCase() || ""
  const description = candidate.type?.description?.toLowerCase() || ""

  return (
    candidate.metadata?.technical_test === true ||
    candidate.metadata?.checkout_exposure === "technical_test" ||
    code.startsWith("technical_test") ||
    description.includes("local validation only")
  )
}

export const isCustomerShippingMethodAllowed = (option?: unknown) =>
  technicalTestCheckoutEnabled || !isTechnicalTestShippingOption(option)

export const isCustomerShippingOptionAllowed = (option: unknown) =>
  technicalTestCheckoutEnabled || !isTechnicalTestShippingOption(option)
