"use server"

import { sdk } from "@lib/config"
import { OptionValueIds } from "@lib/util/product-option-filters"
import { sortProducts } from "@lib/util/sort-products"
import { HttpTypes } from "@medusajs/types"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { getAuthHeaders, getCacheOptions } from "./cookies"
import { getRegion, retrieveRegion } from "./regions"

type ProductListQueryParams = (HttpTypes.FindParams &
  HttpTypes.StoreProductListParams) & {
  options?: string[]
  option_value_id?: string | string[]
}

const REAL_CATALOG_APPROVAL_KEY = "pawfectly_store_integration_approved_by_user"

const STOREFRONT_METADATA_KEYS = [
  REAL_CATALOG_APPROVAL_KEY,
  "pawfectly_storefront_purchasable",
  "pawfectly_availability_mode",
  "pawfectly_selling_price_status",
] as const

const publicMetadata = <T extends { metadata?: Record<string, unknown> | null }>(
  value: T
) => {
  if (!value.metadata) {
    return value.metadata
  }

  return Object.fromEntries(
    STOREFRONT_METADATA_KEYS.flatMap((key) =>
      value.metadata?.[key] === undefined ? [] : [[key, value.metadata[key]]]
    )
  ) as T["metadata"]
}

/**
 * Keep the catalog approval marker and public purchase hints available to the
 * storefront, but never serialize supplier, cost, logistics, risk, or
 * sourcing metadata into customer-facing Server Components.
 */
const sanitizeStorefrontProduct = (
  product: HttpTypes.StoreProduct
): HttpTypes.StoreProduct => ({
  ...product,
  metadata: publicMetadata(product),
  variants:
    product.variants === null
      ? null
      : product.variants?.map((variant) => ({
          ...variant,
          metadata: publicMetadata(variant),
        })),
}) as HttpTypes.StoreProduct

const isApprovedRealCatalogProduct = (product: HttpTypes.StoreProduct) => {
  return product.metadata?.[REAL_CATALOG_APPROVAL_KEY] === "YES"
}

export const listProducts = async ({
  pageParam = 1,
  queryParams,
  countryCode,
  regionId,
}: {
  pageParam?: number
  queryParams?: ProductListQueryParams
  countryCode?: string
  regionId?: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: ProductListQueryParams
}> => {
  if (!countryCode && !regionId) {
    throw new Error("Country code or region ID is required")
  }

  const limit = queryParams?.limit || 12
  const _pageParam = Math.max(pageParam, 1)
  const offset = _pageParam === 1 ? 0 : (_pageParam - 1) * limit

  let region: HttpTypes.StoreRegion | undefined | null

  if (countryCode) {
    region = await getRegion(countryCode)
  } else {
    region = await retrieveRegion(regionId!)
  }

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("products")),
    revalidate: 60,
  }

  const requestedFields = queryParams?.fields
  const fields = requestedFields
    ? `${requestedFields},+metadata`
    : "*variants.calculated_price,+variants.inventory_quantity,*variants.images,*variants.options,+metadata,+tags,"

  return sdk.client
    .fetch<{ products: HttpTypes.StoreProduct[]; count: number }>(
      `/store/products`,
      {
        method: "GET",
        query: {
          ...queryParams,
          // Store API does not expose a metadata approval filter. Fetch the
          // current catalog window before applying the reusable storefront
          // boundary so seed products cannot displace approved products.
          limit: Math.max(100, offset + limit),
          offset: 0,
          region_id: region?.id,
          fields,
        },
        headers,
        next,
        cache: "force-cache",
      }
    )
    .then(({ products }) => {
      const approvedProducts = products.filter(isApprovedRealCatalogProduct)
      const paginatedProducts = approvedProducts.slice(offset, offset + limit)
      const nextPage = approvedProducts.length > offset + limit ? pageParam + 1 : null

      const storefrontProducts = paginatedProducts.map(sanitizeStorefrontProduct)

      return {
        response: {
          products: storefrontProducts,
          count: approvedProducts.length,
        },
        nextPage: nextPage,
        queryParams,
      }
    })
}

/**
 * This will fetch 100 products to the Next.js cache and sort them based on the sortBy parameter.
 * It will then return the paginated products based on the page and limit parameters.
 */
export const listProductsWithSort = async ({
  page = 0,
  queryParams,
  sortBy = "created_at",
  countryCode,
  optionValueIds,
}: {
  page?: number
  queryParams?: ProductListQueryParams
  sortBy?: SortOptions
  countryCode: string
  optionValueIds?: OptionValueIds
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: ProductListQueryParams
}> => {
  const limit = queryParams?.limit || 12
  const optionFilters = Array.from(
    new Set((optionValueIds || []).filter(Boolean))
  )

  const {
    response: { products },
  } = await listProducts({
    pageParam: 0,
    queryParams: {
      ...queryParams,
      ...(optionFilters.length ? { option_value_id: optionFilters } : {}),
      limit: 100,
    },
    countryCode,
  })

  const sortedProducts = sortProducts(products, sortBy)

  const pageParam = (page - 1) * limit

  const filteredCount = products.length

  const nextPage = filteredCount > pageParam + limit ? pageParam + limit : null

  const paginatedProducts = sortedProducts.slice(pageParam, pageParam + limit)

  return {
    response: {
      products: paginatedProducts,
      count: filteredCount,
    },
    nextPage,
    queryParams,
  }
}
