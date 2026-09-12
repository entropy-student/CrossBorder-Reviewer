import { Suspense } from "react"

import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import PaginatedProducts from "@modules/store/templates/paginated-products"
import { HttpTypes } from "@medusajs/types"
import { OptionValueIds } from "@lib/util/product-option-filters"
import CatalogSearch from "@modules/store/components/catalog-search"

export default function CollectionTemplate({
  sortBy,
  collection,
  page,
  countryCode,
  optionValueIds,
  searchQuery,
}: {
  sortBy?: SortOptions
  collection: HttpTypes.StoreCollection
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
  searchQuery?: string
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <main className="ph-catalog-page" data-testid="collection-container">
      <section className="ph-catalog-hero">
        <div className="ph-container ph-catalog-hero-inner">
          <div>
            <p className="ph-kicker">CURATED COLLECTION</p>
            <h1>{collection.title}</h1>
          </div>
          <p>
            A considered edit for slower mornings, softer landings, and the
            small rituals that make a space yours.
          </p>
        </div>
      </section>
      <section className="ph-container ph-catalog-content">
        <div className="ph-catalog-toolbar">
          <CatalogSearch initialQuery={searchQuery} />
          <div className="ph-catalog-controls">
            <RefinementList sortBy={sort} hideOptionsPicker compact />
          </div>
        </div>
        <Suspense fallback={<SkeletonProductGrid numberOfProducts={collection.products?.length} />}>
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            collectionId={collection.id}
            countryCode={countryCode}
            optionValueIds={optionValueIds}
            searchQuery={searchQuery}
          />
        </Suspense>
      </section>
    </main>
  )
}
