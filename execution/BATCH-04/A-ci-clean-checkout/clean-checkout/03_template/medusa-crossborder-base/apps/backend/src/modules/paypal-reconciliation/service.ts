import { MedusaService } from "@medusajs/framework/utils"
import PayPalEventInbox from "./models/paypal-event-inbox"

class PayPalReconciliationModuleService extends MedusaService({ PayPalEventInbox }) {}

export default PayPalReconciliationModuleService
