import { model } from "@medusajs/framework/utils"

export const PayPalEventInbox = model.define("paypal_event_inbox", {
  id: model.id().primaryKey(),
  provider_event_id: model.text().unique(),
  provider: model.text().default("paypal"),
  status: model.enum(["received", "verified", "applied", "held", "failed"]).default("received"),
  provider_resource_id: model.text().nullable(),
  medusa_session_id: model.text().nullable(),
  medusa_order_id: model.text().nullable(),
  amount: model.text().nullable(),
  currency_code: model.text().nullable(),
  event_type: model.text(),
  received_at: model.dateTime(),
  applied_at: model.dateTime().nullable(),
  failure_reason: model.text().nullable(),
  safe_metadata: model.json().nullable(),
})

export default PayPalEventInbox
