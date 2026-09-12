"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useMemo } from "react"

import { ChevronDownMini } from "@medusajs/icons"
import {
  OPTION_VALUE_QUERY_KEY,
  parseOptionValueIds,
} from "@lib/util/product-option-filters"
import OptionsPicker from "./options-picker"
import SortProducts, { SortOptions } from "./sort-products"

type RefinementListProps = {
  sortBy: SortOptions
  search?: boolean
  hideOptionsPicker?: boolean
  compact?: boolean
  "data-testid"?: string
}

const RefinementList = ({
  sortBy,
  hideOptionsPicker = false,
  compact = false,
  "data-testid": dataTestId,
}: RefinementListProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateQueryParams = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      updater(params)

      params.delete("page")

      const queryString = params.toString()
      const currentQuery = searchParams.toString()
      const nextPath = queryString ? `${pathname}?${queryString}` : pathname
      const currentPath = currentQuery
        ? `${pathname}?${currentQuery}`
        : pathname

      if (nextPath !== currentPath) {
        router.push(nextPath)
      }
    },
    [pathname, router, searchParams]
  )

  const setQueryParams = (name: string, value: string) =>
    updateQueryParams((params) => params.set(name, value))

  const selectedOptionValueIds = useMemo(
    () => parseOptionValueIds(searchParams),
    [searchParams]
  )

  const setOptionValueIds = (valueIds: string[]) =>
    updateQueryParams((params) => {
      params.delete(OPTION_VALUE_QUERY_KEY)
      valueIds.forEach((valueId) =>
        params.append(OPTION_VALUE_QUERY_KEY, valueId)
      )
    })

  if (compact) {
    const sortLabels: Record<SortOptions, string> = {
      created_at: "Featured",
      price_asc: "Price: low to high",
      price_desc: "Price: high to low",
    }

    return (
      <div
        className="ph-refinement-list ph-refinement-list--compact"
        data-testid={dataTestId}
      >
        <details className="ph-refinement-disclosure">
          <summary className="ph-refinement-summary">
            <span>Sort</span>
            <strong>{sortLabels[sortBy]}</strong>
            <ChevronDownMini />
          </summary>
          <div className="ph-refinement-panel">
            <SortProducts
              sortBy={sortBy}
              setQueryParams={setQueryParams}
              compact
              data-testid={dataTestId}
            />
          </div>
        </details>
        {!hideOptionsPicker && (
          <details className="ph-refinement-disclosure">
            <summary className="ph-refinement-summary">
              <span>Options</span>
              <strong>
                {selectedOptionValueIds.length
                  ? `${selectedOptionValueIds.length} selected`
                  : "All options"}
              </strong>
              <ChevronDownMini />
            </summary>
            <div className="ph-refinement-panel">
              <OptionsPicker
                selectedValueIds={selectedOptionValueIds}
                setOptionValueIds={setOptionValueIds}
                compact
              />
            </div>
          </details>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-12 py-4 mb-8 small:px-0 pl-6 small:min-w-[250px] small:ml-[1.675rem]">
      <SortProducts
        sortBy={sortBy}
        setQueryParams={setQueryParams}
        data-testid={dataTestId}
      />
      {!hideOptionsPicker && (
        <OptionsPicker
          selectedValueIds={selectedOptionValueIds}
          setOptionValueIds={setOptionValueIds}
        />
      )}
    </div>
  )
}

export default RefinementList
