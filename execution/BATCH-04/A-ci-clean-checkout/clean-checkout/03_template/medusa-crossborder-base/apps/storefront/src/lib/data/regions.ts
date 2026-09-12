"use server"

import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"

export const listRegions = async () => {
  return await sdk.client
    .fetch<{ regions: HttpTypes.StoreRegion[] }>(`/store/regions`, {
      method: "GET",
      cache: "no-store",
    })
    .then(({ regions }) => regions)
}

export const retrieveRegion = async (id: string) => {
  return await sdk.client
    .fetch<{ region: HttpTypes.StoreRegion }>(`/store/regions/${id}`, {
      method: "GET",
      cache: "no-store",
    })
    .then(({ region }) => region)
}

const regionMap = new Map<string, HttpTypes.StoreRegion>()
let regionMapUpdated = 0
const REGION_CACHE_TTL_MS = 60 * 60 * 1000

export const getRegion = async (countryCode: string) => {
  if (Date.now() - regionMapUpdated > REGION_CACHE_TTL_MS) regionMap.clear()
  if (regionMap.has(countryCode)) {
    return regionMap.get(countryCode)
  }

  const regions = await listRegions()

  if (!regions) {
    return null
  }

  regions.forEach((region) => {
    region.countries?.forEach((c) => {
      regionMap.set(c?.iso_2 ?? "", region)
    })
  })
  regionMapUpdated = Date.now()

  const region = countryCode
    ? regionMap.get(countryCode)
    : regionMap.get("us")

  return region
}
