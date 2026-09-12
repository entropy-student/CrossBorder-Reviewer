import { sdk } from "@lib/config"
import { placeOrder } from "@lib/data/cart"
import { getAuthHeaders, getCartId, setCartId } from "@lib/data/cookies"
import { HttpTypes } from "@medusajs/types"
import { unstable_rethrow } from "next/navigation"
import { isPaypalPaymentProvider, isStripeLikePaymentProvider } from "@lib/checkout-exposure"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const { origin, searchParams } = req.nextUrl

  const cartId = searchParams.get("cart_id")
  const requestedCountryCode = searchParams.get("country_code")
  const countryCode =
    requestedCountryCode && /^[a-z]{2}$/i.test(requestedCountryCode)
      ? requestedCountryCode.toLowerCase()
      : null
  const paymentIntent = searchParams.get("payment_intent")
  const paymentIntentClientSecret = searchParams.get(
    "payment_intent_client_secret"
  )
  const redirectStatus = searchParams.get("redirect_status")
  const paypalOrderId = searchParams.get("token")
  const paypalPayerId = searchParams.get("PayerID")
  const paypalCancelled = searchParams.get("cancel") === "1"

  // Without a country code the middleware resolves the customer's region and
  // prefixes it; either way every redirect below stays on this origin.
  const prefix = countryCode ? `/${countryCode}` : ""
  const rejected = () =>
    NextResponse.redirect(`${origin}${prefix}/cart?error=payment_failed`)

  if (paypalOrderId) {
    const activeCartId = cartId || (await getCartId())
    const retry = () =>
      NextResponse.redirect(`${origin}${prefix}/checkout?step=payment&payment_retry=1`)

    if (!/^[A-Za-z0-9_-]{5,64}$/.test(paypalOrderId) || paypalCancelled || !paypalPayerId || !activeCartId) {
      return retry()
    }

    const cart = await sdk.client
      .fetch<HttpTypes.StoreCartResponse>(`/store/carts/${activeCartId}`, {
        method: "GET",
        query: { fields: "payment_collection.payment_sessions.data,payment_collection.payment_sessions.provider_id" },
        headers: { ...(await getAuthHeaders()) },
        cache: "no-store",
      })
      .then(({ cart: currentCart }) => currentCart)
      .catch(() => null)

    const paymentSession = cart?.payment_collection?.payment_sessions?.find(
      (session) => isPaypalPaymentProvider(session.provider_id) && session.data?.paypal_order_id === paypalOrderId
    )

    if (!paymentSession) {
      return retry()
    }

    await setCartId(activeCartId)
    try {
      await placeOrder(activeCartId)
    } catch (error) {
      unstable_rethrow(error)
      return NextResponse.redirect(`${origin}${prefix}/cart?error=order_failed`)
    }

    return NextResponse.redirect(`${origin}${prefix}/cart?error=order_failed`)
  }

  if (
    !cartId?.startsWith("cart_") ||
    !paymentIntent?.startsWith("pi_") ||
    !paymentIntentClientSecret?.startsWith(`${paymentIntent}_secret_`)
  ) {
    return rejected()
  }

  const cart = await sdk.client
    .fetch<HttpTypes.StoreCartResponse>(`/store/carts/${cartId}`, {
      method: "GET",
      query: { fields: "payment_collection.payment_sessions.data,payment_collection.payment_sessions.provider_id" },
      headers: { ...(await getAuthHeaders()) },
      cache: "no-store",
    })
    .then(({ cart }) => cart)
    .catch(() => null)

  const paymentSession = cart?.payment_collection?.payment_sessions?.find(
    (session) => session.data?.id === paymentIntent
  )

  if (
    !paymentSession ||
    !isStripeLikePaymentProvider(paymentSession.provider_id) ||
    paymentSession.data?.client_secret !== paymentIntentClientSecret
  ) {
    return rejected()
  }

  await setCartId(cartId)

  // The customer backed out or the bank declined. Stripe puts the PaymentIntent
  // back into `requires_payment_method`, so the Payment Element can mount
  // against it again — return to the payment step and let them retry.
  if (redirectStatus === "failed") {
    // Do not forward the PaymentIntent client secret back into the browser URL.
    // The active Medusa payment session can remount the provider for a retry.
    const params = new URLSearchParams({
      step: "payment",
      payment_retry: "1",
    })

    return NextResponse.redirect(`${origin}${prefix}/checkout?${params}`)
  }

  if (redirectStatus && redirectStatus !== "succeeded") {
    return rejected()
  }

  try {
    await placeOrder(cartId)
  } catch (error) {
    unstable_rethrow(error)

    return NextResponse.redirect(`${origin}${prefix}/cart?error=order_failed`)
  }

  // Only reached when the cart did not convert into an order.
  return NextResponse.redirect(`${origin}${prefix}/cart?error=order_failed`)
}
