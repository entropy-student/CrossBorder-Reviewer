import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
const [recordPath, builderPath] = process.argv.slice(2)
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
record.commerce.availability_mode = 'PRODUCTION_INVENTORY'
record.commerce.project_owned_inventory = 'YES'
record.metadata = { ...(record.metadata || {}), inventory_location_id: 'sloc_review_fixture' }
record.commerce.variants = record.commerce.variants.map((variant, index) => ({ ...variant, inventory_quantity: index + 7 }))
const { buildPublicMedusaPayload } = await import(pathToFileURL(builderPath))
const payload = buildPublicMedusaPayload(record, { status: 'published', inventoryMode: 'PRODUCTION_INVENTORY' })
const result = {
  builder_accepted_production_inventory: true,
  variants: payload.variants.map(v => ({ sku: v.sku, manage_inventory: v.manage_inventory, has_inventory_quantity: Object.hasOwn(v, 'inventory_quantity'), inventory_quantity: v.inventory_quantity })),
  payload_has_location_id: JSON.stringify(payload).includes('sloc_review_fixture'),
  has_inventory_level_write: Boolean(payload.inventory_levels || payload.inventory_items)
}
console.log(JSON.stringify(result, null, 2))
