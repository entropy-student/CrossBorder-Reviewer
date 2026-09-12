import Image from "next/image"

import { listProducts } from "@lib/data/products"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const rituals = [
  { key: "REST", title: "Beds & comfort", tone: "sand" },
  { key: "PLAY", title: "Toys & enrichment", tone: "sage" },
  { key: "CARE", title: "Grooming", tone: "sand" },
  { key: "EAT", title: "Feeding & bowls", tone: "sage" },
] as const

function ArrowIsland({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`ph-arrow-island${dark ? " ph-arrow-island-dark" : ""}`} aria-hidden="true">
      ↗
    </span>
  )
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <LocalizedClientLink href={href} className="ph-button ph-button-primary">
      <span>{children}</span>
      <ArrowIsland />
    </LocalizedClientLink>
  )
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <LocalizedClientLink href={href} className="ph-button ph-button-secondary">
      <span>{children}</span>
      <ArrowIsland dark />
    </LocalizedClientLink>
  )
}

function EditorialSlot({
  slot,
  className = "",
  image,
  label = "",
}: {
  slot: string
  className?: string
  image?: string | null
  label?: string
}) {
  return (
    <div className={`ph-editorial-slot ${className}`} data-asset-slot={slot}>
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          sizes="(max-width: 767px) 100vw, 50vw"
          className="ph-slot-image"
        />
      ) : label ? (
        <span className="ph-slot-label">{label}</span>
      ) : null}
    </div>
  )
}

function RitualCard({ ritual }: { ritual: (typeof rituals)[number] }) {
  return (
    <LocalizedClientLink href="/store" className={`ph-ritual-card ph-ritual-card-${ritual.tone}`}>
      <div
        className="ph-ritual-media"
        data-asset-slot={`ASSET/HOME/CATEGORY/${ritual.key}`}
        aria-hidden="true"
      />
      <div className="ph-ritual-copy">
        <span className="ph-eyebrow">{ritual.key}</span>
        <span className="ph-ritual-title">{ritual.title}</span>
        <span className="ph-text-link">Discover ↗</span>
      </div>
    </LocalizedClientLink>
  )
}

function ProductCard({ product }: { product: HttpTypes.StoreProduct }) {
  const { cheapestPrice } = getProductPrice({ product })
  const image = product.thumbnail || product.images?.[0]?.url

  return (
    <LocalizedClientLink href={`/products/${product.handle}`} className="ph-product-card group">
      <article>
        <div className="ph-product-frame">
          <div className="ph-product-media" data-asset-slot="ASSET/HOME/PRODUCT/01-04">
            {image ? (
              <Image
                src={image}
                alt={product.title}
                fill
                sizes="(max-width: 767px) 45vw, 25vw"
                className="ph-product-image"
              />
            ) : null}
          </div>
          <div className="ph-product-details">
            <h3>{product.title}</h3>
            <p className="ph-rating" aria-label="Reviews coming soon">Reviews coming soon</p>
            {cheapestPrice && <p className="ph-product-price">{cheapestPrice.calculated_price}</p>}
            <div className="ph-product-meta">
              <span>Shipping details at checkout</span>
              <span className="ph-text-link">View ↗</span>
            </div>
          </div>
        </div>
      </article>
    </LocalizedClientLink>
  )
}

export default async function Homepage({ region }: { region: HttpTypes.StoreRegion }) {
  const {
    response: { products },
  } = await listProducts({
    regionId: region.id,
    queryParams: { limit: 4 },
  })
  const featuredProductHref = products?.[0]?.handle
    ? `/products/${products[0].handle}`
    : "/store"
  const hasApprovedCategoryTaxonomy = false

  return (
    <div className="ph-page">
      <section className="ph-hero">
        <div className="ph-container ph-hero-inner">
          <div className="ph-hero-copy">
            <p className="ph-kicker">FOR CALMER ROUTINES</p>
            <h1>
              <span className="ph-desktop-copy">Better days,<br />shared at home.</span>
              <span className="ph-mobile-copy">Happy pets.<br />Happier home.</span>
            </h1>
            <p className="ph-hero-description">
              Thoughtfully chosen pet essentials that make rest, care, play, and everyday routines feel simpler.
            </p>
            <div className="ph-hero-actions">
              <PrimaryLink href="/store">Shop all</PrimaryLink>
              <SecondaryLink href={featuredProductHref}>View featured product</SecondaryLink>
            </div>
            <p className="ph-trust-line">Thoughtfully chosen&nbsp;&nbsp; · &nbsp;&nbsp;Live product details&nbsp;&nbsp; · &nbsp;&nbsp;Checkout shows available options</p>
          </div>
          <div className="ph-hero-media-shell">
            <div className="ph-hero-media-core">
              <EditorialSlot
                slot="ASSET/HOME/HERO/LIFESTYLE"
                className="ph-hero-slot"
                image="/assets/products/COMP-001-main-square.png"
              />
              <div className="ph-hero-caption">
                <span>Designed for the rhythm of real homes.</span>
                <LocalizedClientLink href="/store" className="ph-text-link">Our approach ↗</LocalizedClientLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      {hasApprovedCategoryTaxonomy && (
        <section className="ph-rituals ph-section-paper">
          <div className="ph-container">
            <div className="ph-section-heading">
              <h2><span className="ph-desktop-copy">Shop by everyday ritual</span><span className="ph-mobile-copy">Shop by routine</span></h2>
              <p>Less clutter. Better choices. Curated around how pets actually live.</p>
            </div>
            <div className="ph-ritual-grid">
              {rituals.map((ritual) => <RitualCard key={ritual.key} ritual={ritual} />)}
            </div>
          </div>
        </section>
      )}

      <section className="ph-products ph-section-moss">
        <div className="ph-container">
          <div className="ph-section-heading">
            <h2>Objects worth keeping around</h2>
            <LocalizedClientLink href="/store" className="ph-text-link">View all products ↗</LocalizedClientLink>
          </div>
          <div className="ph-product-grid">
            {products?.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        </div>
      </section>

      <section className="ph-story">
        <div className="ph-container ph-story-inner">
          <EditorialSlot slot="ASSET/HOME/STORY/LIFESTYLE" className="ph-story-slot" />
          <div className="ph-story-copy">
            <p className="ph-kicker">A HOME-FIRST POINT OF VIEW</p>
            <h2>Useful should still feel beautiful.</h2>
            <p>We favour quiet objects, honest materials, and products that disappear into the rhythm of your home instead of shouting for attention.</p>
            <SecondaryLink href="/store">Shop all</SecondaryLink>
            <span className="ph-editorial-rule" />
          </div>
        </div>
      </section>

      <section className="ph-reviews ph-section-cream">
        <div className="ph-container">
          <h2>Customer notes, when they arrive</h2>
          <div className="ph-review-grid">
            <article className="ph-review-card">
              <p className="ph-review-quote">Customer feedback will appear here when verified feedback is available.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="ph-newsletter">
        <div className="ph-container ph-newsletter-inner">
          <div>
            <p className="ph-kicker">JOIN THE PACK</p>
            <h2>A quieter pet newsletter.</h2>
            <p>Pet tips, considered products, and occasional offers - nothing noisy.</p>
          </div>
          <div className="ph-newsletter-form">
            <PrimaryLink href="/store">Shop all</PrimaryLink>
          </div>
        </div>
      </section>
    </div>
  )
}
