const baseUrl = (process.env.SPREE_API_URL || "http://127.0.0.1:9200").replace(/\/$/, "")
const publishableKey = process.env.SPREE_PUBLISHABLE_KEY
const adminKey = process.env.SPREE_ADMIN_API_KEY
const country = (process.env.SPREE_SMOKE_COUNTRY || "US").toUpperCase()
const currency = (process.env.SPREE_SMOKE_CURRENCY || "USD").toUpperCase()
const locale = process.env.SPREE_SMOKE_LOCALE || "en"
const label = process.env.SPREE_SMOKE_LABEL || "SOURCE"
const shippingPattern = new RegExp(
  process.env.SPREE_SMOKE_SHIPPING_PATTERN || (country === "US" ? "ups ground.*usd|us.*standard" : "fr|eur|standard"),
  "i",
)

if (!publishableKey) throw new Error("SPREE_PUBLISHABLE_KEY is required")
if (!adminKey) throw new Error("SPREE_ADMIN_API_KEY is required")

function unwrap(value) {
  return value && value.data !== undefined ? value.data : value
}

function errorMessage(value) {
  if (!value || typeof value !== "object") return "request failed"
  return value.error?.message || value.message || value.error || "request failed"
}

async function request(path, { method = "GET", body, token, admin = false } = {}) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-spree-api-key": admin ? adminKey : publishableKey,
    "x-spree-country": country,
    "x-spree-currency": currency,
    "x-spree-locale": locale,
  }
  if (token) headers["x-spree-token"] = token

  const response = await fetch(`${baseUrl}/api/v3/${admin ? "admin" : "store"}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let value = null
  try {
    value = text ? JSON.parse(text) : null
  } catch {
    value = { message: text.slice(0, 300) }
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} returned HTTP ${response.status}: ${errorMessage(value)}`)
  }
  return unwrap(value)
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message)
}

function amountAsNumber(value) {
  const amount = value?.amount ?? value?.total ?? value
  const number = Number(amount)
  return Number.isFinite(number) ? number : 0
}

const productsResponse = await request("/products?limit=50")
const products = Array.isArray(productsResponse) ? productsResponse : []
const product = products.find((candidate) =>
  candidate.default_variant_id &&
  candidate.purchasable === true &&
  candidate.in_stock === true &&
  String(candidate.price?.currency || "").toLowerCase() === currency.toLowerCase() &&
  amountAsNumber(candidate.price) > 0,
)
requireValue(product, `No purchasable in-stock product with a positive ${currency} price was returned`)

let cart = await request("/carts", { method: "POST", body: {} })
requireValue(cart?.id && cart?.token, "Cart creation did not return an id and token")
const cartId = cart.id
const cartToken = cart.token

cart = await request(`/carts/${cartId}/items`, {
  method: "POST",
  token: cartToken,
  body: { variant_id: product.default_variant_id, quantity: 1 },
})
requireValue(cart?.items?.length, "Line item was not added to the cart")

const address = {
  first_name: "CB",
  last_name: "Dev017",
  address1: country === "FR" ? "1 Rue de Rivoli" : "1 Market St",
  city: country === "FR" ? "Paris" : "San Francisco",
  postal_code: country === "FR" ? "75001" : "94105",
  country_iso: country,
  phone: "555555017",
}
if (country === "US") address.state_abbr = "CA"
cart = await request(`/carts/${cartId}`, {
  method: "PATCH",
  token: cartToken,
  body: {
    email: `cb-dev-017-${label.toLowerCase()}@example.invalid`,
    shipping_address: address,
    billing_address: address,
  },
})
requireValue(String(cart?.shipping_address?.country_iso || "").toLowerCase() === country.toLowerCase(), `${country} shipping address was not applied`)

const fulfillment = (cart.fulfillments || []).find((candidate) => candidate.delivery_rates?.length)
requireValue(fulfillment, "No fulfillment with delivery rates was returned")
const rates = fulfillment.delivery_rates || []
const shippingRate = rates.find((rate) => shippingPattern.test(rate.name || "")) ||
  rates.find((rate) => /standard|ground|tnt|colissimo/i.test(rate.name || ""))
requireValue(shippingRate?.id, `No expected ${country}/${currency} shipping rate was returned: ${rates.map((rate) => rate.name).join(", ")}`)

cart = await request(`/carts/${cartId}/fulfillments/${fulfillment.id}`, {
  method: "PATCH",
  token: cartToken,
  body: { selected_delivery_rate_id: shippingRate.id },
})
const selectedFulfillment = (cart.fulfillments || []).find((candidate) => candidate.id === fulfillment.id) || fulfillment
const selectedRate = (selectedFulfillment.delivery_rates || []).find((rate) => rate.selected) || shippingRate
const shippingMethodName = selectedRate.name || selectedRate.delivery_method?.name || ""
requireValue(shippingPattern.test(shippingMethodName) || /standard|ground|tnt|colissimo/i.test(shippingMethodName), `Selected shipping method is not the expected ${country}/${currency} path: ${shippingMethodName}`)

const paymentMethod = (cart.payment_methods || []).find((method) =>
  /check|test/i.test(`${method.name || ""} ${method.type || ""}`),
)
requireValue(paymentMethod?.id, "No Check/test payment method was returned for the source cart")
requireValue(paymentMethod.session_required === false, "The selected Check/test payment unexpectedly requires a session")

const payment = await request(`/carts/${cartId}/payments`, {
  method: "POST",
  token: cartToken,
  body: { payment_method_id: paymentMethod.id },
})
requireValue(payment?.id, "Check/test payment creation did not return a payment")

const order = await request(`/carts/${cartId}/complete`, { method: "POST", token: cartToken })
requireValue(order?.id && order?.number, "Cart completion did not return a real order")
requireValue(String(order.currency || "").toLowerCase() === currency.toLowerCase(), `Order currency is not ${currency}: ${order.currency}`)
requireValue(String(order.shipping_address?.country_iso || "").toLowerCase() === country.toLowerCase(), `Order shipping country is not ${country}`)
requireValue(amountAsNumber(order.total) > 0, `Order total is not positive: ${order.total}`)
const orderPayment = (order.payments || []).find((candidate) => candidate.payment_method_id === paymentMethod.id) || order.payments?.[0]
requireValue(orderPayment?.id, "Completed order has no payment record")
requireValue(orderPayment.payment_method_id === paymentMethod.id, "Completed order payment method does not match Check/test payment")

const adminOrder = await request(`/orders/${encodeURIComponent(order.id)}?expand=shipping_address,fulfillments,payments`, { admin: true })
requireValue(adminOrder?.id === order.id, "Admin API did not re-read the same order id")
requireValue(adminOrder?.number === order.number, "Admin API order number does not match Store API")
requireValue(String(adminOrder.currency || "").toLowerCase() === currency.toLowerCase(), `Admin API order currency is not ${currency}`)
requireValue(amountAsNumber(adminOrder.total) === amountAsNumber(order.total), "Admin API total does not match Store API total")
requireValue(String(adminOrder.shipping_address?.country_iso || "").toLowerCase() === country.toLowerCase(), `Admin API shipping country is not ${country}`)
requireValue(adminOrder.payments?.some((candidate) => candidate.payment_method_id === paymentMethod.id), "Admin API payment does not match Check/test payment")

const output = (key, value) => console.log(`${label}_${key}=${value}`)
output("ORDER_SMOKE_PASS", "PASS")
output("PRODUCT_ID", product.id)
output("PRODUCT_NAME", product.name)
output("VARIANT_ID", product.default_variant_id)
output(`PRODUCT_${currency}_PRICE`, product.price.amount)
output("CART_ID", cartId)
output("ORDER_ID", order.id)
output("ORDER_NUMBER", order.number)
output("ORDER_CURRENCY", String(order.currency).toLowerCase())
output("ORDER_COUNTRY", String(order.shipping_address.country_iso).toLowerCase())
output("ORDER_TOTAL", order.total)
output("ORDER_SHIPPING_METHOD", shippingMethodName)
output("ORDER_PAYMENT_METHOD", paymentMethod.name)
output("ORDER_PAYMENT_PROVIDER", paymentMethod.type)
output("ADMIN_API_READ", "PASS")
