import {
  defineMiddlewares,
  MedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  filterCustomerPaymentProviders,
  filterCustomerShippingOptions,
  isTechnicalPaymentProvider,
  isPaypalPaymentProvider,
  isTechnicalShippingOption,
  paypalSandboxCheckoutEnabled,
  technicalTestCheckoutEnabled,
} from "./checkout-boundary"
import { projectPublicProductResponse } from "./public-catalog"

async function readShippingOption(request: MedusaRequest, optionId: string) {
  const query = request.scope.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (input: { entity: string; fields: string[]; filters: Record<string, string> }) => Promise<{ data?: unknown[] }>
  }
  const result = await query.graph({
    entity: "shipping_option",
    fields: ["id", "metadata", "type"],
    filters: { id: optionId },
  })
  return result.data?.[0] as { metadata?: Record<string, unknown> | null; type?: { code?: string | null; description?: string | null } | null } | undefined
}

const readOptionId = (request: MedusaRequest) => {
  const body = (request.body || {}) as { option_id?: unknown }
  return typeof body.option_id === "string" ? body.option_id : undefined
}

const readProviderId = (request: MedusaRequest) => {
  const body = (request.body || {}) as { provider_id?: unknown }
  return typeof body.provider_id === "string" ? body.provider_id : undefined
}

const rejectTechnicalPaymentSession = (
  request: MedusaRequest,
  response: MedusaResponse,
  next: MedusaNextFunction
) => {
  const providerId = readProviderId(request)
  if (!technicalTestCheckoutEnabled && (isTechnicalPaymentProvider(providerId) || (isPaypalPaymentProvider(providerId) && !paypalSandboxCheckoutEnabled))) {
    return response.status(403).json({
      type: "not_allowed",
      message: "Technical payment providers are disabled in customer mode.",
    })
  }

  return next()
}

const rejectTechnicalShippingSelection = async (
  request: MedusaRequest,
  response: MedusaResponse,
  next: MedusaNextFunction
) => {
  if (technicalTestCheckoutEnabled) return next()
  const optionId = readOptionId(request)
  if (!optionId) return response.status(400).json({ type: "invalid_data", message: "A shipping option is required." })
  try {
    const option = await readShippingOption(request, optionId)
    if (!option || isTechnicalShippingOption(option)) {
      return response.status(403).json({ type: "not_allowed", message: "Technical shipping options are disabled in customer mode." })
    }
  } catch {
    return response.status(403).json({ type: "not_allowed", message: "Shipping option eligibility could not be verified." })
  }
  return next()
}

const rejectUnsafeCartCompletion = async (
  request: MedusaRequest,
  response: MedusaResponse,
  next: MedusaNextFunction
) => {
  if (technicalTestCheckoutEnabled) return next()
  const cartId = request.params?.id
  if (!cartId) return response.status(400).json({ type: "invalid_data", message: "A cart ID is required." })
  try {
    const query = request.scope.resolve(ContainerRegistrationKeys.QUERY) as {
      graph: (input: { entity: string; fields: string[]; filters: Record<string, string> }) => Promise<{ data?: unknown[] }>
    }
    const result = await query.graph({
      entity: "cart",
      fields: ["id", "payment_collection.payment_sessions.provider_id", "shipping_methods.shipping_option_id"],
      filters: { id: cartId },
    })
    const cart = result.data?.[0] as {
      payment_collection?: { payment_sessions?: Array<{ provider_id?: string | null }> } | null
      shipping_methods?: Array<{ shipping_option_id?: string | null }>
    } | undefined
    const paymentSessions = cart?.payment_collection?.payment_sessions || []
    if (!cart || paymentSessions.length === 0 || paymentSessions.some((session) =>
      isTechnicalPaymentProvider(session.provider_id) ||
      (isPaypalPaymentProvider(session.provider_id) && !paypalSandboxCheckoutEnabled)
    )) {
      return response.status(403).json({ type: "not_allowed", message: "A reviewed customer payment session is required." })
    }
    const options = await Promise.all((cart.shipping_methods || []).map((method) =>
      method.shipping_option_id ? readShippingOption(request, method.shipping_option_id) : undefined
    ))
    if (options.some((option) => !option || isTechnicalShippingOption(option))) {
      return response.status(403).json({ type: "not_allowed", message: "Technical shipping options are disabled in customer mode." })
    }
  } catch {
    return response.status(403).json({ type: "not_allowed", message: "Checkout eligibility could not be verified." })
  }
  return next()
}

const filterResponseCollection = (
  key: "payment_providers" | "shipping_options",
  filter: (items: unknown[]) => unknown[]
) => (_request: MedusaRequest, response: MedusaResponse, next: MedusaNextFunction) => {
  const json = response.json.bind(response)
  response.json = ((body: Record<string, unknown>) => {
    const items = body && Array.isArray(body[key]) ? body[key] : null
    if (!items || technicalTestCheckoutEnabled) {
      return json(body)
    }

    return json({ ...body, [key]: filter(items) })
  }) as typeof response.json

  return next()
}

const projectPublicProducts = (_request: MedusaRequest, response: MedusaResponse, next: MedusaNextFunction) => {
  const json = response.json.bind(response)
  response.json = ((body: unknown) => json(projectPublicProductResponse(body))) as typeof response.json
  return next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/products",
      methods: ["GET"],
      middlewares: [projectPublicProducts],
    },
    {
      matcher: "/store/products/:id",
      methods: ["GET"],
      middlewares: [projectPublicProducts],
    },
    {
      matcher: "/store/carts/:id",
      methods: ["GET"],
      middlewares: [projectPublicProducts],
    },
    {
      matcher: "/store/orders/:id",
      methods: ["GET"],
      middlewares: [projectPublicProducts],
    },
    {
      matcher: "/store/payment-providers",
      methods: ["GET"],
      middlewares: [
        filterResponseCollection("payment_providers", (items) =>
          filterCustomerPaymentProviders(items as { id?: string | null }[])
        ),
      ],
    },
    {
      matcher: "/store/payment-collections/:id/payment-sessions",
      methods: ["POST"],
      middlewares: [rejectTechnicalPaymentSession],
    },
    {
      matcher: "/store/shipping-options",
      methods: ["GET"],
      middlewares: [
        filterResponseCollection("shipping_options", (items) =>
          filterCustomerShippingOptions(items as { name?: string | null; provider_id?: string | null; metadata?: Record<string, unknown> | null; type?: { code?: string | null; description?: string | null } | null }[])
        ),
      ],
    },
    {
      matcher: "/store/carts/:id/shipping-methods",
      methods: ["POST"],
      middlewares: [rejectTechnicalShippingSelection],
    },
    {
      matcher: "/store/carts/:id/complete",
      methods: ["POST"],
      middlewares: [rejectUnsafeCartCompletion],
    },
  ],
})
