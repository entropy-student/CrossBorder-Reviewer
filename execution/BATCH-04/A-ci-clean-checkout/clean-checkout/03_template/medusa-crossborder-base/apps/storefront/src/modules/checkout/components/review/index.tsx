"use client"

import { Heading, Text, clx } from "@modules/common/components/ui"

import PaymentButton from "../payment-button"
import { useSearchParams } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import {
  isCustomerPaymentProviderAllowed,
  isCustomerShippingMethodAllowed,
} from "@lib/checkout-exposure"

const Review = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards && ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])?.length > 0 && cart?.total === 0
  )

  const hasCustomerShippingMethod = Boolean(
    cart.shipping_methods?.some((method) =>
      isCustomerShippingMethodAllowed(method)
    )
  )
  const hasCustomerPaymentSession = Boolean(
    cart.payment_collection?.payment_sessions?.some((session) =>
      isCustomerPaymentProviderAllowed(session.provider_id)
    )
  )

  const previousStepsCompleted =
    cart.shipping_address &&
    hasCustomerShippingMethod &&
    (hasCustomerPaymentSession || paidByGiftcard)

  return (
    <div className="ph-checkout-section ph-checkout-review bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none": !isOpen,
            }
          )}
        >
          Review
        </Heading>
      </div>
      {isOpen && previousStepsCompleted && (
        <>
          <div className="flex items-start gap-x-1 w-full mb-6">
            <div className="w-full">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                By clicking Place Order, you confirm that the contact, shipping,
                delivery, and payment details above are correct.
              </Text>
            </div>
          </div>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </>
      )}
    </div>
  )
}

export default Review
