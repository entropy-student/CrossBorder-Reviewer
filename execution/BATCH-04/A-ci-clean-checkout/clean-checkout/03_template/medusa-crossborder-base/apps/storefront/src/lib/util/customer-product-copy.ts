import { HttpTypes } from "@medusajs/types"

const INTERNAL_COPY_PATTERN =
  /(available source material|needs[_\s-]?verification|supplier claim|source evidence|unverified)/i

export const getCustomerProductDescription = (
  product: Pick<HttpTypes.StoreProduct, "description">
) => {
  const description = product.description?.trim()

  if (!description || INTERNAL_COPY_PATTERN.test(description)) {
    return "A thoughtfully selected pet essential for everyday home routines."
  }

  return description
}
