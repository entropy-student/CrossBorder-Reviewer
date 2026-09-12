import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import Medusa from '@medusajs/js-sdk'

function readEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[line.slice(0, i).trim()] = v
  }
  return out
}

function die(msg, extra) {
  console.error(`\n[FAIL] ${msg}`)
  if (extra) console.error(extra)
  process.exit(1)
}

const root = process.cwd()
const envPath = path.join(root, '.env.local')
const env = readEnv(envPath)
const baseUrl = env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
const publishableKey = env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
if (!publishableKey) die(`Missing NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY in ${envPath}`)

const sdk = new Medusa({ baseUrl, publishableKey, debug: false })

console.log('CrossBorder US/USD smoke order')
console.log(`Backend: ${baseUrl}`)

// 1) US region
const regionResp = await sdk.client.fetch('/store/regions', { method: 'GET' })
const regions = regionResp.regions || []
const usRegion = regions.find(r => (r.countries || []).some(c => String(c.iso_2 || c.iso2 || '').toLowerCase() === 'us'))
if (!usRegion) die('No Region containing United States was returned by Store API.')
if (String(usRegion.currency_code || '').toLowerCase() !== 'usd') {
  die(`United States region is not USD. Found currency_code=${usRegion.currency_code}`)
}
console.log(`[OK] US region: ${usRegion.name} (${usRegion.id}), currency USD`)

// 2) Find a sellable product/variant in the US region.
const productResp = await sdk.client.fetch('/store/products', {
  method: 'GET',
  query: {
    region_id: usRegion.id,
    limit: 50,
    fields: '*variants.calculated_price'
  }
})
const products = productResp.products || []
let chosen = null
for (const p of products) {
  for (const v of (p.variants || [])) {
    const cp = v.calculated_price
    if (cp && String(cp.currency_code || '').toLowerCase() === 'usd' && cp.calculated_amount != null) {
      chosen = { product: p, variant: v, amount: cp.calculated_amount }
      break
    }
  }
  if (chosen) break
}
if (!chosen) die('No product variant with a calculated USD price was found for the US region.')
console.log(`[OK] Product: ${chosen.product.title} / ${chosen.variant.title} -> $${Number(chosen.amount).toFixed(2)}`)

// 3) Create cart and add item.
let { cart } = await sdk.store.cart.create({ region_id: usRegion.id })
console.log(`[OK] Cart created: ${cart.id}`)
;({ cart } = await sdk.store.cart.createLineItem(cart.id, { variant_id: chosen.variant.id, quantity: 1 }))
console.log(`[OK] Added item. subtotal=${cart.subtotal} ${String(cart.currency_code || '').toUpperCase()}`)

// 4) US test address.
const address = {
  first_name: 'Test',
  last_name: 'Customer',
  address_1: '123 Test Street',
  city: 'Los Angeles',
  province: 'CA',
  postal_code: '90001',
  country_code: 'us'
}
;({ cart } = await sdk.store.cart.update(cart.id, {
  email: 'test-us-order@example.com',
  shipping_address: address,
  billing_address: address
}))
console.log('[OK] US shipping/billing address applied')

// 5) Shipping option.
const shipResp = await sdk.client.fetch('/store/shipping-options', {
  method: 'GET',
  query: { cart_id: cart.id }
})
const shippingOptions = shipResp.shipping_options || []
if (!shippingOptions.length) {
  die('No shipping option is available for this US cart. Most likely the new US warehouse/service zone is not eligible for the seeded product inventory.',
      'Check inventory location assignment or shipping-profile/location linkage in Medusa Admin.')
}
const shipping = shippingOptions.find(o => /us standard shipping/i.test(o.name || '')) || shippingOptions[0]
if (!/us standard shipping/i.test(shipping.name || '')) {
  die(`The US cart did not expose the expected US Standard Shipping option. Selected: ${shipping.name || '(unnamed)'}`,
      `Available options: ${shippingOptions.map(o => o.name || o.id).join(', ')}`)
}
console.log(`[OK] Shipping option: ${shipping.name} (${shipping.id})`)
;({ cart } = await sdk.store.cart.addShippingMethod(cart.id, { option_id: shipping.id }))
console.log(`[OK] Shipping method added. shipping_total=${cart.shipping_total}`)

// 6) System payment session.
const providerResp = await sdk.client.fetch('/store/payment-providers', {
  method: 'GET',
  query: { region_id: usRegion.id }
})
const providers = providerResp.payment_providers || []
const systemProvider = providers.find(p => p.id === 'pp_system_default' || /system/i.test(p.id || ''))
if (!systemProvider) die(`System payment provider not returned for US region. Providers: ${providers.map(p => p.id).join(', ') || '(none)'}`)
if (systemProvider.id !== 'pp_system_default') {
  die(`A non-canonical payment provider matched the System check: ${systemProvider.id}`)
}
console.log(`[OK] Payment provider: ${systemProvider.id}`)
const payResp = await sdk.store.payment.initiatePaymentSession(cart, { provider_id: systemProvider.id })
cart = payResp.cart || cart
const paymentCollection = payResp.payment_collection || cart.payment_collection
if (!paymentCollection?.id) {
  die('System payment initialization did not return a payment collection.', JSON.stringify(payResp, null, 2))
}
if (Array.isArray(paymentCollection.payment_sessions) && paymentCollection.payment_sessions.length === 0) {
  die('System payment initialization returned an empty payment session list.', JSON.stringify(paymentCollection, null, 2))
}
if (Array.isArray(paymentCollection.payment_sessions) && !paymentCollection.payment_sessions.some(s => s.provider_id === systemProvider.id || s.provider_id === 'pp_system_default')) {
  die('Payment collection does not contain a session for pp_system_default.', JSON.stringify(paymentCollection, null, 2))
}
console.log('[OK] Payment session initialized')

// 7) Complete order.
const result = await sdk.store.cart.complete(cart.id)
if (result.type !== 'order' || !result.order) {
  die('Cart completion did not return an order.', JSON.stringify(result, null, 2))
}
const order = result.order
if (!order.id) die('Completed cart returned an order-shaped response without an order id.', JSON.stringify(order, null, 2))
if (String(order.currency_code || '').toLowerCase() !== 'usd') {
  die(`Completed order currency is not USD: ${order.currency_code}`)
}
if (String(order.shipping_address?.country_code || '').toLowerCase() !== 'us') {
  die(`Completed order shipping country is not US: ${order.shipping_address?.country_code}`)
}
if (!(Number(order.total) > 0)) {
  die(`Completed order total is not a positive USD amount: ${order.total}`)
}
if (order.payment_collection && order.payment_collection.id !== paymentCollection.id) {
  die('Completed order payment collection does not match the initialized System payment collection.')
}
console.log('\nUS_ORDER_SMOKE_PASS')
console.log(`Order ID: ${order.id}`)
console.log(`Display ID: ${order.display_id}`)
console.log(`Currency: ${String(order.currency_code || '').toUpperCase()}`)
console.log(`Total: ${order.total}`)
console.log(`Country: ${order.shipping_address?.country_code}`)
