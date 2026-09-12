import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { getCustomerProductDescription } from "@lib/util/customer-product-copy"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
}

const ProductInfo = ({ product }: ProductInfoProps) => {
  return (
    <div id="product-info" className="ph-pdp-info">
      <div className="ph-pdp-info-copy">
        {product.collection && (
          <LocalizedClientLink
            href={`/collections/${product.collection.handle}`}
            className="ph-pdp-collection"
          >
            {product.collection.title}
          </LocalizedClientLink>
        )}
        <h1 className="ph-pdp-title" data-testid="product-title">
          {product.title}
        </h1>

        <p
          className="ph-pdp-description"
          data-testid="product-description"
        >
          {getCustomerProductDescription(product)}
        </p>
      </div>
    </div>
  )
}

export default ProductInfo
