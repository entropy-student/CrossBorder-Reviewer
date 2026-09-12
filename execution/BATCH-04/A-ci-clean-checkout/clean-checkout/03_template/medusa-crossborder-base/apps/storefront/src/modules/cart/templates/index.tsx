import ItemsTemplate from "./items"
import Summary from "./summary"
import EmptyCartMessage from "../components/empty-cart-message"
import SignInPrompt from "../components/sign-in-prompt"
import Divider from "@modules/common/components/divider"
import { HttpTypes } from "@medusajs/types"

const CartTemplate = ({
  cart,
  customer,
  errorMessage,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
  errorMessage?: string | null
}) => {
  return (
    <div className="ph-cart-page">
      <div className="ph-container ph-cart-container" data-testid="cart-container">
        {errorMessage && (
          <div className="mb-6 text-rose-500 text-small-regular" role="alert" aria-live="polite" data-testid="cart-recovery-message">
            {errorMessage}
          </div>
        )}
        {cart?.items?.length ? (
          <div className="ph-cart-layout grid grid-cols-1 small:grid-cols-[1fr_360px] gap-x-40">
            <div className="ph-cart-items-panel flex flex-col bg-white py-6 gap-y-6">
              {!customer && (
                <>
                  <SignInPrompt />
                  <Divider />
                </>
              )}
              <ItemsTemplate cart={cart} />
            </div>
            <div className="ph-cart-summary-column relative">
              <div className="flex flex-col gap-y-8 sticky top-12">
                {cart && cart.region && (
                  <>
                    <div className="ph-cart-summary bg-white py-6">
                      <Summary cart={cart} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <EmptyCartMessage />
          </div>
        )}
      </div>
    </div>
  )
}

export default CartTemplate
