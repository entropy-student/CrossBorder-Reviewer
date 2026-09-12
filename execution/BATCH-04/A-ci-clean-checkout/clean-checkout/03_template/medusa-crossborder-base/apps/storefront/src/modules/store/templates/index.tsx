import { Suspense } from "react"

import { OptionValueIds } from "@lib/util/product-option-filters"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import CatalogSearch from "@modules/store/components/catalog-search"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
  optionValueIds,
  searchQuery,
  focusSearch,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
  searchQuery?: string
  focusSearch?: boolean
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <main
      className="ph-catalog-page"
      data-testid="category-container"
    >
      <section className="ph-catalog-hero">
        <div className="ph-container ph-catalog-hero-inner">
          <div>
            <p className="ph-kicker">THE EVERYDAY EDIT</p>
            <h1 data-testid="store-page-title">All the good things.</h1>
          </div>
          <p>
            Thoughtful objects for the rituals that make home feel like home.
            Browse the full collection, then follow what feels right.
          </p>
        </div>
      </section>
      <section className="ph-container ph-catalog-content">
        <div className="ph-catalog-toolbar">
          <CatalogSearch initialQuery={searchQuery} autoFocus={focusSearch} />
          <div className="ph-catalog-controls">
            <RefinementList sortBy={sort} compact />
          </div>
        </div>
        <Suspense fallback={<SkeletonProductGrid />}>
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            countryCode={countryCode}
            optionValueIds={optionValueIds}
            searchQuery={searchQuery}
          />
        </Suspense>
      </section>
    </main>
  )
}

export default StoreTemplate
