export type CustomerPaymentProvider = { id?: string | null }

export type CustomerShippingOption = {
  name?: string | null
  provider_id?: string | null
  metadata?: Record<string, unknown> | null
  type?: { code?: string | null; description?: string | null } | null
}

export const technicalTestCheckoutEnabled =
  process.env.MEDUSA_CHECKOUT_INSTANCE_MODE === "technical_test"

export const paypalSandboxCheckoutEnabled =
  process.env.MEDUSA_CHECKOUT_INSTANCE_MODE === "paypal_sandbox_test"

export const isTechnicalPaymentProvider = (providerId?: string | null) =>
  Boolean(providerId?.startsWith("pp_system_default"))

export const isPaypalPaymentProvider = (providerId?: string | null) =>
  Boolean(providerId?.startsWith("pp_paypal"))

export const isTechnicalShippingOption = (
  option: CustomerShippingOption
) => {
  const code = option.type?.code?.toLowerCase() || ""
  const description = option.type?.description?.toLowerCase() || ""
  const metadata = option.metadata || {}

  return (
    metadata.technical_test === true ||
    metadata.checkout_exposure === "technical_test" ||
    code.startsWith("technical_test") ||
    description.includes("local validation only")
  )
}

export const filterCustomerPaymentProviders = <T extends CustomerPaymentProvider>(
  providers: T[]
) =>
  technicalTestCheckoutEnabled
    ? providers
    : providers.filter((provider) =>
        !isTechnicalPaymentProvider(provider.id) &&
        (paypalSandboxCheckoutEnabled || !isPaypalPaymentProvider(provider.id))
      )

export const filterCustomerShippingOptions = <T extends CustomerShippingOption>(
  options: T[]
) =>
  technicalTestCheckoutEnabled
    ? options
    : options.filter((option) => !isTechnicalShippingOption(option))
