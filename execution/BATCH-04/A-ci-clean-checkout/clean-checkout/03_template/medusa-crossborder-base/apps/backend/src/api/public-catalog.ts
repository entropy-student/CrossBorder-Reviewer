const PUBLIC_PRODUCT_METADATA_KEYS = new Set([
  "pawfectly_store_integration_approved_by_user",
  "pawfectly_storefront_purchasable",
  "pawfectly_availability_mode",
  "pawfectly_selling_price_status",
])

type ProductLike = {
  metadata?: Record<string, unknown> | null
  variants?: unknown
  [key: string]: unknown
}

const projectMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata
  }

  return Object.fromEntries(
    Object.entries(metadata as Record<string, unknown>).filter(([key]) =>
      PUBLIC_PRODUCT_METADATA_KEYS.has(key)
    )
  )
}

const projectProduct = (product: ProductLike): ProductLike => ({
  ...product,
  metadata: projectMetadata(product.metadata) as Record<string, unknown>,
  ...(Array.isArray(product.variants)
    ? {
        variants: product.variants.map((variant) =>
          variant && typeof variant === "object" && !Array.isArray(variant)
            ? projectProduct(variant as ProductLike)
            : variant
        ),
      }
    : {}),
})

const projectNestedCatalogEntities = (value: unknown, key?: string): unknown => {
  if (Array.isArray(value)) {
    const singularKey =
      key === "products"
        ? "product"
        : key === "variants"
          ? "variant"
          : undefined
    return value.map((item) => projectNestedCatalogEntities(item, singularKey))
  }

  if (!value || typeof value !== "object") {
    return value
  }

  if (key === "product" || key === "variant") {
    return projectProduct(value as ProductLike)
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
      childKey,
      projectNestedCatalogEntities(childValue, childKey),
    ])
  )
}

export const projectPublicProductResponse = (body: unknown) => {
  return projectNestedCatalogEntities(body)
}
