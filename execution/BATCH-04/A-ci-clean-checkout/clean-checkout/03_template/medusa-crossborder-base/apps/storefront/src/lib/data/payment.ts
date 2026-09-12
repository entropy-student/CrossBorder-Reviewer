"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheOptions } from "./cookies"
import { HttpTypes } from "@medusajs/types"
import { isCustomerPaymentProviderAllowed } from "@lib/checkout-exposure"

export const listCartPaymentMethods = async (regionId: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("payment_providers")),
  }

  return sdk.client
    .fetch<HttpTypes.StorePaymentProviderListResponse>(
      `/store/payment-providers`,
      {
        method: "GET",
        query: { region_id: regionId },
        headers,
        next,
        cache: "no-store",
      }
    )
    .then(({ payment_providers }) =>
      payment_providers
        .filter((provider) => isCustomerPaymentProviderAllowed(provider.id))
        .sort((a, b) => {
          return a.id > b.id ? 1 : -1
        })
    )
    .catch(() => {
      return null
    })
}
