/**
 * Build the native Medusa inventory-level write plan for a production catalog
 * record. This module is intentionally pure: it never talks to Medusa and
 * never mutates the local database.
 */
export function buildInventoryPlan(record, product) {
  if (record?.commerce?.availability_mode !== "PRODUCTION_INVENTORY") {
    throw new Error("Inventory-level planning requires PRODUCTION_INVENTORY mode.")
  }

  const locationId = String(record.metadata?.inventory_location_id || "").trim()
  if (!locationId) throw new Error("PRODUCTION_INVENTORY requires metadata.inventory_location_id.")

  const expectedVariants = Array.isArray(record.commerce?.variants) ? record.commerce.variants : []
  const actualVariants = Array.isArray(product?.variants) ? product.variants : []
  const plans = expectedVariants.map((expected) => {
    const actual = actualVariants.find((variant) => variant?.sku === expected.internal_sku)
    const inventoryRelation = Array.isArray(actual?.inventory_items) ? actual.inventory_items[0] : undefined
    const inventoryItemId = inventoryRelation?.inventory_item_id || inventoryRelation?.inventory_item?.id
    if (!actual?.id || !inventoryItemId) {
      throw new Error(`Variant ${expected.internal_sku} has no linked Medusa inventory item.`)
    }
    if (!Number.isInteger(expected.inventory_quantity) || expected.inventory_quantity < 0) {
      throw new Error(`Variant ${expected.internal_sku} requires a non-negative integer inventory_quantity.`)
    }
    if (actual.manage_inventory !== true) {
      throw new Error(`Variant ${expected.internal_sku} must have manage_inventory=true before inventory-level write.`)
    }
    return {
      variant_id: actual.id,
      sku: expected.internal_sku,
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      stocked_quantity: expected.inventory_quantity,
    }
  })

  if (plans.length !== expectedVariants.length || plans.length === 0) {
    throw new Error("Every production variant must produce exactly one inventory-level plan.")
  }
  return plans
}

export function inventoryLevelRequest(plan) {
  return {
    pathname: `/admin/inventory-items/${encodeURIComponent(plan.inventory_item_id)}/location-levels`,
    method: "POST",
    body: {
      location_id: plan.location_id,
      stocked_quantity: plan.stocked_quantity,
    },
  }
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  console.log("INVENTORY_PLAN_MODULE=READY")
  console.log("MEDUSA_WRITE=NO")
}
