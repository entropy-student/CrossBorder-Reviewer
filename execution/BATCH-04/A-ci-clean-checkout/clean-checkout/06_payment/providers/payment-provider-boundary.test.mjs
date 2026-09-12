import assert from "node:assert/strict"
import {
  PAYMENT_STATES,
  PaymentProviderAdapter,
  PaymentProviderNotConfiguredError,
} from "./payment-provider-adapter.mjs"

assert.deepEqual(PAYMENT_STATES, [
  "CREATED",
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
])

const adapter = new PaymentProviderAdapter({
  providerId: "WORLDFIRST_UNCONFIGURED",
  environment: "sandbox",
})

for (const operation of [
  "createPaymentSession",
  "getPaymentStatus",
  "authorizePayment",
  "capturePayment",
  "cancelPayment",
  "refundPayment",
  "verifyWebhook",
  "normalizePaymentEvent",
]) {
  await assert.rejects(
    async () => adapter[operation](),
    (error) => error instanceof PaymentProviderNotConfiguredError
  )
}

console.log("PAYMENT_BOUNDARY_TEST=PASS")
console.log("REAL_PAYMENT_CALL=NO")
console.log("FAKE_SUCCESS_RESPONSE=NO")
