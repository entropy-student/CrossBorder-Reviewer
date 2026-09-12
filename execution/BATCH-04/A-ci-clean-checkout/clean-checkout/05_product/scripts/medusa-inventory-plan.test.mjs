import assert from "node:assert/strict"
import { buildInventoryPlan, inventoryLevelRequest } from "./medusa-inventory-plan.mjs"

const record = {
  commerce: {
    availability_mode: "PRODUCTION_INVENTORY",
    variants: [{ internal_sku: "PAW-TEST-001", inventory_quantity: 3 }],
  },
  metadata: { inventory_location_id: "sl_test" },
}
const product = {
  variants: [{
    id: "variant_test",
    sku: "PAW-TEST-001",
    manage_inventory: true,
    inventory_items: [{ inventory_item_id: "iitem_test" }],
  }],
}

const plan = buildInventoryPlan(record, product)
assert.deepEqual(plan, [{
  variant_id: "variant_test",
  sku: "PAW-TEST-001",
  inventory_item_id: "iitem_test",
  location_id: "sl_test",
  stocked_quantity: 3,
}])
assert.deepEqual(inventoryLevelRequest(plan[0]), {
  pathname: "/admin/inventory-items/iitem_test/location-levels",
  method: "POST",
  body: { location_id: "sl_test", stocked_quantity: 3 },
})
assert.throws(() => buildInventoryPlan({ ...record, metadata: {} }, product), /inventory_location_id/)
assert.throws(() => buildInventoryPlan({ ...record, commerce: { ...record.commerce, variants: [{ ...record.commerce.variants[0], inventory_quantity: null }] } }, product), /inventory_quantity/)
assert.throws(() => buildInventoryPlan(record, { variants: [{ ...product.variants[0], inventory_items: [] }] }), /inventory item/)
console.log("MEDUSA_INVENTORY_PLAN_TEST=PASS")
console.log("MEDUSA_WRITE=NO")
