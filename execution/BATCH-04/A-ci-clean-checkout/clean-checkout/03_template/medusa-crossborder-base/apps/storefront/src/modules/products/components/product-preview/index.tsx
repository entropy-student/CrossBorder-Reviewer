import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"

export default async function ProductPreview({
  product,
  isFeatured,
  region: _region,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
}) {
  // const pricedProduct = await listProducts({
  //   regionId: region.id,
  //   queryParams: { id: [product.id!] },
  // }).then(({ response }) => response.products[0])

  // if (!pricedProduct) {
  //   return null
  // }

  const { cheapestPrice } = getProductPrice({
    product,
  })

  return (
    <LocalizedClientLink href={`/products/${product.handle}`} className="ph-catalog-card group">
      <div data-testid="product-wrapper">
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="square"
          isFeatured={isFeatured}
          className="ph-catalog-card-media"
        />
        <div className="ph-catalog-card-details">
          <div className="ph-catalog-card-heading">
            <span className="ph-catalog-card-title" data-testid="product-title">
            {product.title}
            </span>
            <span className="ph-catalog-card-arrow" aria-hidden="true">↗</span>
          </div>
          <div className="ph-catalog-card-meta">
            <span className="ph-catalog-card-rating">Reviews coming soon</span>
            <span className="ph-catalog-card-price" data-testid="price">
              {cheapestPrice?.calculated_price || "Price unavailable"}
            </span>
          </div>
        </div>
      </div>
    </LocalizedClientLink>
  )
}
