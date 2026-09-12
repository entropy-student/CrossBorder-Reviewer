import { Module } from "@medusajs/framework/utils"
import PayPalReconciliationModuleService from "./service"

export const PAYPAL_RECONCILIATION_MODULE = "paypal_reconciliation"

export default Module(PAYPAL_RECONCILIATION_MODULE, {
  service: PayPalReconciliationModuleService,
})
