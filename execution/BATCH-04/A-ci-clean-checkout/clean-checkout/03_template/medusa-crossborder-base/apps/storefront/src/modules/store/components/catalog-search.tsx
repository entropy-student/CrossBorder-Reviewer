"use client"

import { usePathname } from "next/navigation"

export default function CatalogSearch({
  initialQuery,
  autoFocus = false,
}: {
  initialQuery?: string
  autoFocus?: boolean
}) {
  const pathname = usePathname()

  return (
    <form className="ph-catalog-search" action={pathname} method="get">
      <label className="sr-only" htmlFor="catalog-search">
        Search the store
      </label>
      <input
        id="catalog-search"
        name="q"
        type="search"
        defaultValue={initialQuery}
        placeholder="Search the collection"
        autoFocus={autoFocus}
      />
      <button type="submit">Search ↗</button>
    </form>
  )
}
