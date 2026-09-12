import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, ModuleRegistrationName, Modules } from "@medusajs/framework/utils"
import { createRegionsWorkflow, createShippingOptionsWorkflow, createStockLocationsWorkflow, createTaxRegionsWorkflow, linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"

export default async function augment({ container }: { container: MedusaContainer }) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillment = container.resolve(ModuleRegistrationName.FULFILLMENT)
  const { data: regions } = await query.graph({ entity: "region", fields: ["id", "name", "currency_code", "countries.iso_2"] })
  const { data: salesChannels } = await query.graph({ entity: "sales_channel", fields: ["id", "name", "is_disabled"] })
  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id", "name", "type"] })
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id", "name"] })
  const { data: taxRegions } = await query.graph({ entity: "tax_region", fields: ["id", "country_code"] })
  const { data: fulfillmentSets } = await query.graph({ entity: "fulfillment_set", fields: ["id", "name", "type", "service_zones.*"] })
  const { data: shippingOptions } = await query.graph({ entity: "shipping_option", fields: ["id", "name", "service_zone_id"] })
  let usRegion: any = regions.find((r: any) => r.currency_code === "usd" && (r.countries || []).some((c: any) => c.iso_2 === "us"))
  const salesChannel: any = salesChannels.find((s: any) => !s.is_disabled) || salesChannels[0]
  const shippingProfile: any = profiles[0]
  if (!salesChannel || !shippingProfile) throw new Error("Baseline sales channel or shipping profile is missing")

  if (!usRegion) {
    const { result: [created] } = await createRegionsWorkflow(container).run({ input: { regions: [{ name: "United States", currency_code: "usd", countries: ["us"], payment_providers: ["pp_system_default"] }] } })
    usRegion = created
  }
  if (!taxRegions.some((t: any) => t.country_code === "us")) {
    await createTaxRegionsWorkflow(container).run({ input: [{ country_code: "us", provider_id: "tp_system" }] })
  }

  let location: any = locations.find((l: any) => l.name === "US Test Warehouse")
  if (!location) {
    const { result: [created] } = await createStockLocationsWorkflow(container).run({ input: { locations: [{ name: "US Test Warehouse", address: { city: "Los Angeles", country_code: "US", address_1: "123 Test Street" } }] } })
    location = created
    await link.create({ [Modules.STOCK_LOCATION]: { stock_location_id: location.id }, [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" } })
    await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: location.id, add: [salesChannel.id] } })
  }

  let fulfillmentSet: any = fulfillmentSets.find((f: any) => f.name === "US Warehouse delivery")
  if (!fulfillmentSet) {
    fulfillmentSet = await fulfillment.createFulfillmentSets({ name: "US Warehouse delivery", type: "shipping", service_zones: [{ name: "United States", geo_zones: [{ country_code: "us", type: "country" }] }] })
    await link.create({ [Modules.STOCK_LOCATION]: { stock_location_id: location.id }, [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id } })
  }

  let shippingOption: any = shippingOptions.find((s: any) => s.name === "US Standard Shipping")
  if (!shippingOption) {
    const { result: [created] } = await createShippingOptionsWorkflow(container).run({ input: [{ name: "US Standard Shipping", price_type: "flat", provider_id: "manual_manual", service_zone_id: fulfillmentSet.service_zones[0].id, shipping_profile_id: shippingProfile.id, type: { label: "Standard", description: "Ship in 2-3 days.", code: "standard" }, prices: [{ currency_code: "usd", amount: 100 }, { region_id: usRegion.id, amount: 100 }], rules: [{ attribute: "enabled_in_store", value: "true", operator: "eq" }, { attribute: "is_return", value: "false", operator: "eq" }] }] })
    shippingOption = created
  }
  console.log(`MEDUSA_US_REGION_ID=${usRegion.id}`)
  console.log(`MEDUSA_US_LOCATION_ID=${location.id}`)
  console.log(`MEDUSA_US_FULFILLMENT_SET_ID=${fulfillmentSet.id}`)
  console.log(`MEDUSA_US_SHIPPING_OPTION_ID=${shippingOption.id}`)
  console.log("MEDUSA_US_USD_AUGMENTATION=PASS")
}
