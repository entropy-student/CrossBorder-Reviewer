import { loadEnv, defineConfig, MedusaError } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const paypalProviderEnabled = process.env.PAYPAL_PROVIDER_ENABLED?.toLowerCase() === "true"
const paypalAutoCapture = process.env.PAYPAL_AUTO_CAPTURE?.toLowerCase() === "true"
const paypalPaymentIntent = process.env.PAYPAL_PAYMENT_INTENT?.toUpperCase() || "AUTHORIZE"
const paypalCredentialIsConfigured = (value: string | undefined) => {
  const normalized = value?.trim() || ""
  return Boolean(
    normalized &&
      !/^<[^>]+>$/.test(normalized) &&
      !/(PLACEHOLDER|SET_LOCALLY|LOCAL_ONLY|GENERATED_BY)/i.test(normalized)
  )
}

if (paypalAutoCapture) {
  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "PAYPAL_AUTO_CAPTURE=true is unsupported; the reviewed PayPal path is AUTHORIZE only."
  )
}

if (paypalPaymentIntent !== "AUTHORIZE") {
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "PAYPAL_PAYMENT_INTENT must be AUTHORIZE for the reviewed PayPal path."
  )
}

if (
  paypalProviderEnabled &&
  (!paypalCredentialIsConfigured(process.env.PAYPAL_CLIENT_ID) ||
    !paypalCredentialIsConfigured(process.env.PAYPAL_CLIENT_SECRET))
) {
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "PAYPAL_PROVIDER_ENABLED=true requires non-placeholder PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET."
  )
}

if (paypalProviderEnabled && process.env.PAYPAL_ENVIRONMENT?.toLowerCase() === "production") {
  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    "PayPal production transport is disabled in this review batch; sandbox is the only allowed environment."
  )
}

const paypalModules = paypalProviderEnabled
  ? {
      modules: [
        {
          resolve: "./src/modules/paypal-reconciliation",
        },
        {
          resolve: "@medusajs/medusa/payment",
          options: {
            providers: [
              {
                resolve: "./src/modules/paypal",
                id: "paypal",
                options: {
                  enabled: true,
                  environment: process.env.PAYPAL_ENVIRONMENT || "sandbox",
                  client_id: process.env.PAYPAL_CLIENT_ID,
                  client_secret: process.env.PAYPAL_CLIENT_SECRET,
                  webhook_id: process.env.PAYPAL_WEBHOOK_ID,
                  return_url: process.env.PAYPAL_RETURN_URL,
                  cancel_url: process.env.PAYPAL_CANCEL_URL,
                  auto_capture: false,
                  payment_intent: "AUTHORIZE",
                },
              },
            ],
          },
        },
      ],
    }
  : {}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  ...paypalModules,
})
