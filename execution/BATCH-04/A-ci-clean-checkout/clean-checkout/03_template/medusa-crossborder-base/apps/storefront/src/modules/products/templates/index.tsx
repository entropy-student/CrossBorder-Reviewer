import React, { Suspense } from "react"
import Image from "next/image"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { getCustomerProductDescription } from "@lib/util/customer-product-copy"

import ProductActionsWrapper from "./product-actions-wrapper"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
  images,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  const lifestyleImage = product.thumbnail || images?.[0]?.url || null
  const customerBenefits = (product.tags || [])
    .map((tag) => tag.value)
    .filter(Boolean)
    .slice(0, 3)
    .map((value) => value.replace(/[-_]+/g, " "))

  return (
    <main className="ph-pdp-page" data-testid="product-container">
      <div className="ph-container ph-pdp-breadcrumb" aria-label="Breadcrumb">
        <a href={`/${countryCode}`}>Home</a>
        <span aria-hidden="true">/</span>
        {product.collection?.handle ? (
          <a href={`/${countryCode}/collections/${product.collection.handle}`}>
            {product.collection.title}
          </a>
        ) : (
          <span>Shop</span>
        )}
        <span aria-hidden="true">/</span>
        <span>{product.title}</span>
      </div>

      <section className="ph-pdp-hero">
        <div className="ph-container ph-pdp-hero-inner">
          <div className="ph-pdp-gallery-column">
            <ImageGallery images={images} />
          </div>
          <div className="ph-pdp-purchase-panel">
            <ProductInfo product={product} />
            <div className="ph-pdp-rating" aria-label="Reviews coming soon">
              <span>Reviews coming soon</span>
            </div>
            <Suspense
              fallback={
                <ProductActions
                  disabled={true}
                  product={product}
                  region={region}
                />
              }
            >
              <ProductActionsWrapper id={product.id} region={region} />
            </Suspense>
            <div className="ph-pdp-reassurance">
              <span className="ph-pdp-reassurance-mark" aria-hidden="true">+</span>
              <div>
                <strong>Thoughtfully made, easy to live with.</strong>
                <p>Product details and available options are shown before you place an order.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ph-pdp-why">
        <div className="ph-container ph-pdp-why-inner">
          <div className="ph-pdp-lifestyle-slot">
            {lifestyleImage ? (
              <Image
                src={lifestyleImage}
                alt={product.title}
                fill
                sizes="(max-width: 767px) 100vw, 50vw"
                className="ph-slot-image"
              />
            ) : null}
          </div>
          <div className="ph-pdp-why-copy">
            <p className="ph-kicker">WHY IT WORKS</p>
            <h2>Made for the little rituals that matter.</h2>
            <p>{getCustomerProductDescription(product)}</p>
            {customerBenefits.length > 0 && (
              <div className="ph-pdp-benefits" aria-label="Product tags">
                {customerBenefits.map((benefit) => (
                  <span key={benefit}>{benefit}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="ph-container ph-pdp-details">
        <div className="ph-pdp-details-intro">
          <p className="ph-kicker">THE DETAILS</p>
          <h2>Good to know.</h2>
          <p>Everything you need to decide if it belongs in your routine.</p>
        </div>
        <ProductTabs product={product} />
      </section>

      <section className="ph-pdp-reviews">
        <div className="ph-container ph-pdp-reviews-inner">
          <div>
            <p className="ph-kicker">CUSTOMER NOTES</p>
            <h2>A home collection in the making.</h2>
          </div>
          <div className="ph-pdp-review-empty">
            <p>Customer reviews will appear here as they arrive.</p>
          </div>
        </div>
      </section>

      <div className="ph-container ph-pdp-related" data-testid="related-products-container">
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </main>
  )
}

export default ProductTemplate
