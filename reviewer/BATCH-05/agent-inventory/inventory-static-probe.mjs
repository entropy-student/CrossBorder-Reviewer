import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const projectRoot = "C:/Users/34707/Documents/ChatGPT/跨境电商/CrossBorder-Independent-Store"
const inventoryModulePath = `${projectRoot}/05_product/scripts/medusa-inventory-plan.mjs`
const middlewarePath = `${projectRoot}/03_template/medusa-crossborder-base/apps/backend/src/api/middlewares.ts`
const upsertPath = `${projectRoot}/05_product/scripts/medusa-product-upsert.mjs`

const { buildInventoryPlan } = await import(pathToFileURL(inventoryModulePath).href)

const record = {
  commerce: {
    availability_mode: "PRODUCTION_INVENTORY",
    variants: [
      { internal_sku: "SKU-A", inventory_quantity: 7 },
      { internal_sku: "SKU-B", inventory_quantity: 9 },
    ],
  },
  metadata: { inventory_location_id: "sl_nonexistent" },
}

const product = {
  variants: [
    { id: "variant_a", sku: "SKU-A", manage_inventory: true, inventory_items: [{ inventory_item_id: "iitem_shared" }] },
    { id: "variant_b", sku: "SKU-B", manage_inventory: true, inventory_items: [{ inventory_item_id: "iitem_shared" }] },
  ],
}

let plan
let planError = null
try {
  plan = buildInventoryPlan(record, product)
} catch (error) {
  planError = error.message
}

const middleware = await readFile(middlewarePath, "utf8")
const upsert = await readFile(upsertPath, "utf8")
const actualMatchers = [...middleware.matchAll(/matcher:\s*"([^"]+)"/g)].map((match) => match[1])
const requiredResponseRoutes = [
  "/store/product-variants",
  "/store/product-variants/:id",
  "/store/carts/:id/customer",
  "/store/carts/:id/promotions",
  "/store/carts/:id/taxes",
]

const result = {
  main_project_write: false,
  bogus_location_accepted_by_plan: Array.isArray(plan) && plan.length === 2,
  shared_inventory_item_location_pair_accepted: Array.isArray(plan) && new Set(plan.map((item) => `${item.inventory_item_id}|${item.location_id}`)).size === 1,
  plan_error: planError,
  missing_customer_response_route_matchers: requiredResponseRoutes.filter((route) => !actualMatchers.includes(route)),
  available_quantity_numeric_value_asserted: /Number\(level\.available_quantity\)/.test(upsert),
  reserved_quantity_numeric_value_asserted: /Number\(level\.reserved_quantity\)/.test(upsert),
  sales_channel_relation_checked_by_inventory_sync: /sales[_-]?channel/i.test(upsert.slice(upsert.indexOf("async function syncInventoryLevels"), upsert.indexOf("async function execute"))),
}

console.log(JSON.stringify(result, null, 2))
