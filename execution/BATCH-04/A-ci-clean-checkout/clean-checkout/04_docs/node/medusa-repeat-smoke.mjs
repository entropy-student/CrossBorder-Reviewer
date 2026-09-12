import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Medusa = require(process.env.MEDUSA_SDK_PATH || '@medusajs/js-sdk').default

const baseUrl = (process.env.MEDUSA_BACKEND_URL || 'http://127.0.0.1:9300').replace(/\/$/, '')
const publishableKey = process.env.MEDUSA_PUBLISHABLE_KEY
const adminToken = process.env.MEDUSA_ADMIN_TOKEN
const country = (process.env.MEDUSA_SMOKE_COUNTRY || 'US').toLowerCase()
const currency = (process.env.MEDUSA_SMOKE_CURRENCY || 'USD').toLowerCase()
const label = process.env.MEDUSA_SMOKE_LABEL || 'MEDUSA_REPEAT_US_USD'
const shippingPattern = new RegExp(process.env.MEDUSA_SMOKE_SHIPPING_PATTERN || (country === 'us' ? 'US Standard Shipping' : 'Standard Shipping'), 'i')

function fail(message, detail) {
  console.error(`[FAIL] ${message}`)
  if (detail) console.error(detail)
  process.exit(1)
}
function assert(condition, message, detail) { if (!condition) fail(message, detail) }
assert(publishableKey, 'MEDUSA_PUBLISHABLE_KEY is missing')
assert(adminToken, 'MEDUSA_ADMIN_TOKEN is missing')

const sdk = new Medusa({ baseUrl, publishableKey, debug: false })
const regionResp = await sdk.client.fetch('/store/regions', { method: 'GET' })
const region = (regionResp.regions || []).find((r) => String(r.currency_code).toLowerCase() === currency && (r.countries || []).some((c) => String(c.iso_2 || '').toLowerCase() === country))
assert(region, `No ${country.toUpperCase()} region with currency ${currency.toUpperCase()} was returned`)

const productsResp = await sdk.client.fetch('/store/products', { method: 'GET', query: { region_id: region.id, limit: 50, fields: '*variants.calculated_price' } })
let chosen
for (const product of productsResp.products || []) {
  for (const variant of product.variants || []) {
    const price = variant.calculated_price
    if (price && String(price.currency_code).toLowerCase() === currency && Number(price.calculated_amount) > 0) {
      chosen = { product, variant, price }
      break
    }
  }
  if (chosen) break
}
assert(chosen, `No sellable product with a positive ${currency.toUpperCase()} price was returned`)

let { cart } = await sdk.store.cart.create({ region_id: region.id })
assert(cart?.id, 'Cart creation failed')
;({ cart } = await sdk.store.cart.createLineItem(cart.id, { variant_id: chosen.variant.id, quantity: 1 }))
assert(cart?.items?.length, 'Line item was not added')

const address = country === 'fr'
  ? { first_name: 'Repeat', last_name: 'France', address_1: '1 Rue de Rivoli', city: 'Paris', postal_code: '75001', country_code: 'fr' }
  : { first_name: 'Repeat', last_name: 'United States', address_1: '123 Test Street', city: 'Los Angeles', province: 'CA', postal_code: '90001', country_code: 'us' }
;({ cart } = await sdk.store.cart.update(cart.id, { email: `${label.toLowerCase()}@example.invalid`, shipping_address: address, billing_address: address }))
assert(String(cart.shipping_address?.country_code).toLowerCase() === country, 'Shipping address country was not applied')

const shippingResp = await sdk.client.fetch('/store/shipping-options', { method: 'GET', query: { cart_id: cart.id } })
const shipping = (shippingResp.shipping_options || []).find((option) => shippingPattern.test(option.name || ''))
assert(shipping, `Expected shipping option was not returned for ${country.toUpperCase()}`, (shippingResp.shipping_options || []).map((o) => o.name).join(', '))
;({ cart } = await sdk.store.cart.addShippingMethod(cart.id, { option_id: shipping.id }))

const providersResp = await sdk.client.fetch('/store/payment-providers', { method: 'GET', query: { region_id: region.id } })
const system = (providersResp.payment_providers || []).find((provider) => provider.id === 'pp_system_default')
assert(system, 'pp_system_default was not returned for the region')
const paymentResp = await sdk.store.payment.initiatePaymentSession(cart, { provider_id: system.id })
cart = paymentResp.cart || cart
const collection = paymentResp.payment_collection || cart.payment_collection
assert(collection?.id, 'System payment collection was not created')
assert(!Array.isArray(collection.payment_sessions) || collection.payment_sessions.some((s) => s.provider_id === system.id), 'System payment session is missing')

const completed = await sdk.store.cart.complete(cart.id)
assert(completed.type === 'order' && completed.order?.id, 'Cart completion did not produce a real order', JSON.stringify(completed))
const order = completed.order
assert(String(order.currency_code).toLowerCase() === currency, `Order currency mismatch: ${order.currency_code}`)
assert(String(order.shipping_address?.country_code).toLowerCase() === country, `Order country mismatch: ${order.shipping_address?.country_code}`)
assert(Number(order.total) > 0, `Order total is not positive: ${order.total}`)

const adminResponse = await fetch(`${baseUrl}/admin/orders/${encodeURIComponent(order.id)}?fields=*`, { headers: { Accept: 'application/json', Authorization: `Bearer ${adminToken}` } })
assert(adminResponse.ok, `Admin order re-read failed with HTTP ${adminResponse.status}`)
const adminPayload = await adminResponse.json()
const adminOrder = adminPayload.order || adminPayload
assert(adminOrder.id === order.id, 'Admin API returned a different order id')
const adminCurrency = adminOrder.currency_code || adminOrder.payment_collections?.[0]?.currency_code
assert(String(adminCurrency).toLowerCase() === currency, 'Admin order currency mismatch')
assert(String(adminOrder.shipping_address?.country_code).toLowerCase() === country, 'Admin order country mismatch')
assert(Number(adminOrder.total) === Number(order.total), 'Admin order total mismatch')

console.log(`${label}_PASS`)
console.log(`${label}_REGION_ID=${region.id}`)
console.log(`${label}_PRODUCT_ID=${chosen.product.id}`)
console.log(`${label}_VARIANT_ID=${chosen.variant.id}`)
console.log(`${label}_PRODUCT_PRICE=${chosen.price.calculated_amount}`)
console.log(`${label}_CART_ID=${cart.id}`)
console.log(`${label}_ORDER_ID=${order.id}`)
console.log(`${label}_ORDER_DISPLAY_ID=${order.display_id}`)
console.log(`${label}_ORDER_CURRENCY=${currency}`)
console.log(`${label}_ORDER_COUNTRY=${country}`)
console.log(`${label}_ORDER_TOTAL=${order.total}`)
console.log(`${label}_SHIPPING_OPTION=${shipping.name}`)
console.log(`${label}_PAYMENT_PROVIDER=${system.id}`)
console.log(`${label}_ADMIN_API_READ=PASS`)
