import { Suspense } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"

export default async function Nav({ currencyCode }: { currencyCode?: string }) {
  return (
    <>
      <div className="ph-announcement">A calmer way to shop for everyday pet essentials.</div>
      <header className="ph-header">
        <nav className="ph-container ph-nav" aria-label="Primary navigation">
          <LocalizedClientLink href="/" className="ph-brand" data-testid="nav-store-link">Pawfectly Home</LocalizedClientLink>
          <div className="ph-nav-links">
            <LocalizedClientLink href="/store">Shop all</LocalizedClientLink>
          </div>
          <div className="ph-nav-actions">
            <LocalizedClientLink href="/store?focus=search" className="ph-search-link">Search</LocalizedClientLink>
            <LocalizedClientLink href="/account" className="ph-account-link" data-testid="nav-account-link">Account</LocalizedClientLink>
            {currencyCode && <span className="ph-currency">{currencyCode.toUpperCase()}</span>}
            <Suspense fallback={<LocalizedClientLink href="/cart" data-testid="nav-cart-link">Bag 0</LocalizedClientLink>}>
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>
    </>
  )
}
