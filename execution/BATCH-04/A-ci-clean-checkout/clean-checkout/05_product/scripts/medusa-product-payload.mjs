const publicMetadata = (record, commerce) => Object.fromEntries(
  Object.entries({
    pawfectly_public_metadata_version: "1",
    pawfectly_product_master_version: record.schema_version,
    pawfectly_record_type: record.record_type || "SELLABLE_PRODUCT",
    pawfectly_source_product_id: record.identity?.source_product_id,
    pawfectly_internal_sku: record.identity?.internal_sku,
    pawfectly_record_status: record.record_status,
    pawfectly_store_integration_approved_by_user: record.metadata?.store_integration_approved_by_user,
    pawfectly_selling_price_status: record.metadata?.selling_price_status || (commerce.selling_price === null ? "NEEDS_USER_CONFIRMATION" : "CONFIRMED_BY_USER"),
    pawfectly_selling_price_confirmed: record.metadata?.selling_price_confirmed || (commerce.selling_price === null ? "NO" : "YES"),
    pawfectly_storefront_purchasable: commerce.storefront_purchasable,
    pawfectly_availability_mode: commerce.availability_mode,
    pawfectly_public_category: record.taxonomy?.product_category,
  }).filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => [key, typeof value === "object" ? JSON.stringify(value) : value])
)

const assetUrl = (asset) => asset && typeof asset === "object" && asset.url ? asset.url : null

const runtimeAmount = (value) => {
  if (value === null || value === undefined || value === "UNKNOWN" || value === "NEEDS_VERIFICATION") return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

/**
 * The single public catalog payload builder used by both dry-run and write paths.
 * Local preview is explicitly non-inventory-managed. Production inventory is
 * never inferred from UNKNOWN; callers must pass a validated native inventory
 * mode before asking this builder to emit manage_inventory=true.
 */
export function buildPublicMedusaPayload(record, { status = "draft", inventoryMode } = {}) {
  const commerce = record.commerce || {}
  const identity = record.identity || {}
  const content = record.content || {}
  const assets = record.assets || {}
  const currencyCode = commerce.currency && !["UNKNOWN", "NEEDS_VERIFICATION"].includes(String(commerce.currency).toUpperCase())
    ? String(commerce.currency).toLowerCase()
    : null
  const variants = Array.isArray(commerce.variants) ? commerce.variants : []
  const optionNames = Array.from(new Set([
    ...(Array.isArray(commerce.option_names) ? commerce.option_names : []),
    ...variants.flatMap((variant) => Object.keys(variant?.options || {})),
  ].filter((value) => value !== null && value !== undefined && value !== "")))
  const imageUrls = [assetUrl(assets.main_image), ...(assets.gallery_images || []).map(assetUrl)]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
  const localPreview = inventoryMode === "LOCAL_PREVIEW_AVAILABILITY"
  const productionInventory = inventoryMode === "PRODUCTION_INVENTORY"
  if (productionInventory) {
    const locationId = record.metadata?.inventory_location_id
    const quantitiesAreExplicit = variants.every((variant) => Number.isInteger(variant?.inventory_quantity) && variant.inventory_quantity >= 0)
    if (typeof locationId !== "string" || !locationId.trim() || !quantitiesAreExplicit) {
      throw new Error("PRODUCTION_INVENTORY requires an explicit inventory_location_id and non-negative inventory_quantity for every variant.")
    }
  }
  const metadata = publicMetadata(record, commerce)

  return {
    title: identity.title,
    handle: identity.handle,
    subtitle: identity.subtitle,
    description: content.long_description || content.short_description,
    thumbnail: assetUrl(assets.thumbnail) || assetUrl(assets.main_image),
    images: imageUrls.map((url) => ({ url })),
    options: optionNames.map((title) => ({
      title,
      values: [...new Set(variants.map((variant) => variant.options?.[title]).filter((value) => value !== null && value !== undefined && value !== ""))],
    })),
    metadata,
    variants: variants.map((variant) => ({
      title: variant.title || variant.internal_sku,
      sku: variant.internal_sku,
      options: variant.options || {},
      prices: currencyCode && runtimeAmount(variant.selling_price ?? commerce.selling_price) !== null
        ? [{ amount: runtimeAmount(variant.selling_price ?? commerce.selling_price), currency_code: currencyCode }]
        : [],
      ...(localPreview || productionInventory ? { manage_inventory: productionInventory } : {}),
      metadata: {
        pawfectly_storefront_purchasable: variant.storefront_purchasable,
      },
    })),
    ...(status ? { status } : {}),
  }
}
