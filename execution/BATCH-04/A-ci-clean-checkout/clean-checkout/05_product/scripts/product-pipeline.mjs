#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { buildPublicMedusaPayload } from "./medusa-product-payload.mjs"

const CURRENT_SCHEMA_VERSION = "1.1.0"
const UNKNOWN_MARKERS = new Set(["", "UNKNOWN", "NEEDS_VERIFICATION", "N/A", "TBD"])
const INVENTORY_STATUSES = new Set(["IN_STOCK", "OUT_OF_STOCK", "BACKORDER", "DISCONTINUED"])
const RECORD_STATUSES = new Set(["DRAFT", "TEST_FIXTURE_ONLY", "READY_FOR_REVIEW", "READY_FOR_IMPORT", "PUBLISHED"])
const WEIGHT_UNITS = new Set(["g", "kg", "oz", "lb"])
const DIMENSION_UNITS = new Set(["mm", "cm", "m", "in"])
const SUPPORTED_CURRENCIES = new Map([["USD", 2], ["EUR", 2]])
const ASSET_STATUSES = new Set(["VERIFIED", "UNVERIFIED", "NEEDS_VERIFICATION", "TEST_FIXTURE_ONLY"])
const HS_STATUSES = new Set(["VERIFIED", "UNVERIFIED", "NEEDS_VERIFICATION"])
const PURCHASABILITY_VALUES = new Set(["YES", "NO", "UNKNOWN", "NEEDS_VERIFICATION"])
const AVAILABILITY_MODES = new Set(["LOCAL_PREVIEW_AVAILABILITY", "PRODUCTION_INVENTORY", "UNKNOWN", "NEEDS_VERIFICATION"])
const SECTIONS = [
  "identity",
  "commerce",
  "physical",
  "content",
  "taxonomy",
  "assets",
  "operations",
  "cross_border",
  "provenance",
]

function parseArgs(argv) {
  const [mode, ...rest] = argv
  const options = { mode: mode || "help" }
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]
    if (argument === "--json") {
      options.json = true
      continue
    }
    if (argument.startsWith("--")) {
      const key = argument.slice(2)
      const value = rest[index + 1]
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`)
      options[key] = value
      index += 1
      continue
    }
    throw new Error(`Unexpected argument: ${argument}`)
  }
  return options
}

function readRecord(inputPath) {
  if (!inputPath) throw new Error("Use --input <Product Master JSON>")
  const absolutePath = path.resolve(inputPath)
  let parsed
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"))
  } catch (error) {
    throw new Error(`Cannot read valid JSON from ${absolutePath}: ${error.message}`)
  }
  if (!isPlainObject(parsed)) throw new Error("Product Master root must be a JSON object")
  return parsed
}

function get(record, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => value?.[key], record)
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isUnknown(value) {
  return value === null || value === undefined ||
    (typeof value === "string" && UNKNOWN_MARKERS.has(value.trim().toUpperCase()))
}

function isKnown(value) {
  return !isUnknown(value)
}

function blockerLabel(gate) {
  return `${gate.replace("_REQUIRED", "").toLowerCase()} blocker`
}

function issue(issues, gate, field, state, message, classification, severity) {
  issues.push({ gate, field, state, message, classification, severity })
}

function schemaIssue(issues, field, message, state = "INVALID") {
  issue(issues, "IMPORT_REQUIRED", field, state, `Schema: ${message}`, "import blocker", "BLOCKER")
}

function checkNoExtra(value, allowedKeys, field, issues) {
  if (!isPlainObject(value)) return
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) schemaIssue(issues, `${field}.${key}`, "Unknown property is not allowed by the Product Master schema.")
  }
}

function checkRequiredKeys(value, keys, field, issues) {
  if (!isPlainObject(value)) return
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) schemaIssue(issues, `${field}.${key}`, "Required property is missing.", "MISSING")
  }
}

function checkStringOrNull(value, field, issues) {
  if (value !== null && value !== undefined && typeof value !== "string") {
    schemaIssue(issues, field, "Expected a string or null.")
  }
}

function checkNumberOrUnknown(value, field, issues, positive = false) {
  if (value === null || value === undefined) return
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (positive && value <= 0)) schemaIssue(issues, field, positive ? "Expected a finite number greater than zero." : "Expected a finite number.")
    return
  }
  if (typeof value !== "string" || !["UNKNOWN", "NEEDS_VERIFICATION"].includes(value)) {
    schemaIssue(issues, field, positive ? "Expected a positive number, null, UNKNOWN or NEEDS_VERIFICATION." : "Expected a number, null, UNKNOWN or NEEDS_VERIFICATION.")
  }
}

function checkStringArray(value, field, issues) {
  if (!Array.isArray(value)) {
    schemaIssue(issues, field, "Expected an array of strings.")
    return
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string") schemaIssue(issues, `${field}[${index}]`, "Array entries must be strings.")
  })
}

function checkEnum(value, field, allowed, issues) {
  if (typeof value !== "string" || !allowed.has(value)) schemaIssue(issues, field, `Expected one of: ${Array.from(allowed).join(", ")}.`)
}

function checkMeasurementShape(value, field, issues) {
  if (!isPlainObject(value)) {
    schemaIssue(issues, field, "Weight must be an object with value and unit; bare numbers are not accepted.")
    return
  }
  checkRequiredKeys(value, ["value", "unit"], field, issues)
  checkNoExtra(value, new Set(["value", "unit"]), field, issues)
  checkNumberOrUnknown(value.value, `${field}.value`, issues, true)
  if (typeof value.unit !== "string" || !new Set(["g", "kg", "oz", "lb", "UNKNOWN", "NEEDS_VERIFICATION"]).has(value.unit)) {
    schemaIssue(issues, `${field}.unit`, "Weight unit must be g, kg, oz, lb, UNKNOWN or NEEDS_VERIFICATION.")
  }
}

function checkDimensionsShape(value, field, issues) {
  if (value === null) return
  if (!isPlainObject(value)) {
    schemaIssue(issues, field, "Dimensions must be an object or null.")
    return
  }
  checkRequiredKeys(value, ["length", "width", "height", "unit"], field, issues)
  checkNoExtra(value, new Set(["length", "width", "height", "unit"]), field, issues)
  for (const key of ["length", "width", "height"]) checkNumberOrUnknown(value[key], `${field}.${key}`, issues, true)
  if (typeof value.unit !== "string" || !new Set(["mm", "cm", "m", "in", "UNKNOWN", "NEEDS_VERIFICATION"]).has(value.unit)) {
    schemaIssue(issues, `${field}.unit`, "Dimension unit must be mm, cm, m, in, UNKNOWN or NEEDS_VERIFICATION.")
  }
}

function checkAssetShape(value, field, issues) {
  if (value === null) return
  if (!isPlainObject(value)) {
    schemaIssue(issues, field, "Asset must be an object or null.")
    return
  }
  checkRequiredKeys(value, ["url", "alt", "source", "status"], field, issues)
  checkNoExtra(value, new Set(["url", "alt", "source", "status", "notes"]), field, issues)
  for (const key of ["url", "alt", "source", "notes"]) if (Object.prototype.hasOwnProperty.call(value, key)) checkStringOrNull(value[key], `${field}.${key}`, issues)
  if (Object.prototype.hasOwnProperty.call(value, "status")) checkEnum(value.status, `${field}.status`, ASSET_STATUSES, issues)
}

function checkHsShape(value, field, issues) {
  if (!isPlainObject(value)) {
    schemaIssue(issues, field, "HS code must be an object with value, status and evidence.")
    return
  }
  checkRequiredKeys(value, ["value", "status", "evidence"], field, issues)
  checkNoExtra(value, new Set(["value", "status", "evidence"]), field, issues)
  checkStringOrNull(value.value, `${field}.value`, issues)
  if (Object.prototype.hasOwnProperty.call(value, "status")) checkEnum(value.status, `${field}.status`, HS_STATUSES, issues)
  checkStringOrNull(value.evidence, `${field}.evidence`, issues)
}

function checkIdentityShape(value, issues) {
  const field = "identity"
  if (!isPlainObject(value)) { schemaIssue(issues, field, "Expected an object.", "MISSING"); return }
  checkNoExtra(value, new Set(["source_product_id", "supplier_name", "supplier_url", "internal_sku", "handle", "title", "subtitle"]), field, issues)
  for (const key of ["source_product_id", "supplier_name", "supplier_url", "internal_sku", "handle", "title", "subtitle"]) checkStringOrNull(value[key], `${field}.${key}`, issues)
}

function checkVariantShape(value, field, issues) {
  if (!isPlainObject(value)) { schemaIssue(issues, field, "Variant must be an object."); return }
  checkRequiredKeys(value, ["source_variant_id", "internal_sku", "title", "options", "selling_price", "compare_at_price", "inventory_status", "inventory_quantity"], field, issues)
  checkNoExtra(value, new Set(["source_variant_id", "internal_sku", "title", "options", "selling_price", "compare_at_price", "inventory_status", "inventory_quantity", "storefront_purchasable"]), field, issues)
  for (const key of ["source_variant_id", "internal_sku", "title", "inventory_status"]) checkStringOrNull(value[key], `${field}.${key}`, issues)
  checkNumberOrUnknown(value.selling_price, `${field}.selling_price`, issues)
  checkNumberOrUnknown(value.compare_at_price, `${field}.compare_at_price`, issues)
  checkNumberOrUnknown(value.inventory_quantity, `${field}.inventory_quantity`, issues)
  if (value.storefront_purchasable !== undefined) checkEnum(value.storefront_purchasable, `${field}.storefront_purchasable`, PURCHASABILITY_VALUES, issues)
  if (!isPlainObject(value.options)) schemaIssue(issues, `${field}.options`, "Variant options must be an object.")
  else for (const [key, optionValue] of Object.entries(value.options)) checkStringOrNull(optionValue, `${field}.options.${key}`, issues)
}

function checkSectionObject(record, section, required, allowed, issues) {
  const value = record[section]
  if (!isPlainObject(value)) { schemaIssue(issues, section, "Required contract section must be an object.", "MISSING"); return null }
  checkRequiredKeys(value, required, section, issues)
  checkNoExtra(value, allowed, section, issues)
  return value
}

function validateSchemaShape(record) {
  const issues = []
  if (!isPlainObject(record)) {
    schemaIssue(issues, "root", "Product Master root must be an object.")
    return issues
  }
  const rootKeys = new Set(["schema_version", "record_type", "record_status", ...SECTIONS, "metadata"])
  checkRequiredKeys(record, ["schema_version", "record_status", ...SECTIONS], "root", issues)
  checkNoExtra(record, rootKeys, "root", issues)
  if (record.schema_version !== CURRENT_SCHEMA_VERSION) schemaIssue(issues, "schema_version", `Expected ${CURRENT_SCHEMA_VERSION}; Product Master 1.0.0 weight/HS records must be explicitly upgraded.`)
  if (record.record_type !== undefined && (typeof record.record_type !== "string" || !new Set(["SELLABLE_PRODUCT", "TEST_FIXTURE_ONLY"]).has(record.record_type))) schemaIssue(issues, "record_type", "Record type must be SELLABLE_PRODUCT or TEST_FIXTURE_ONLY when supplied.")
  if (typeof record.record_status !== "string" || !RECORD_STATUSES.has(record.record_status)) schemaIssue(issues, "record_status", "Unsupported record status.")
  if (record.metadata !== undefined && !isPlainObject(record.metadata)) schemaIssue(issues, "metadata", "Metadata must be an object.")

  const identity = checkSectionObject(record, "identity", [], new Set(["source_product_id", "supplier_name", "supplier_url", "internal_sku", "handle", "title", "subtitle"]), issues)
  if (identity) checkIdentityShape(identity, issues)

  const commerce = checkSectionObject(record, "commerce", ["currency", "cost_price", "selling_price", "compare_at_price", "option_names", "variants", "inventory_status", "inventory_quantity"], new Set(["currency", "cost_price", "selling_price", "compare_at_price", "option_names", "variants", "inventory_status", "inventory_quantity", "supplier_stock_status", "project_owned_inventory", "storefront_purchasable", "availability_mode"]), issues)
  if (commerce) {
    if (commerce.currency !== null && commerce.currency !== undefined && (typeof commerce.currency !== "string" || !new Set(["USD", "EUR", "UNKNOWN", "NEEDS_VERIFICATION"]).has(commerce.currency))) schemaIssue(issues, "commerce.currency", "Only USD, EUR, UNKNOWN or NEEDS_VERIFICATION are supported.")
    for (const key of ["cost_price", "selling_price", "compare_at_price", "inventory_quantity"]) checkNumberOrUnknown(commerce[key], `commerce.${key}`, issues)
    checkStringArray(commerce.option_names, "commerce.option_names", issues)
    if (commerce.variants !== null && !Array.isArray(commerce.variants)) schemaIssue(issues, "commerce.variants", "Variants must be an array or null.")
    else if (Array.isArray(commerce.variants)) commerce.variants.forEach((variant, index) => checkVariantShape(variant, `commerce.variants[${index}]`, issues))
    checkStringOrNull(commerce.inventory_status, "commerce.inventory_status", issues)
    for (const key of ["supplier_stock_status", "project_owned_inventory"]) if (commerce[key] !== undefined) checkStringOrNull(commerce[key], `commerce.${key}`, issues)
    if (commerce.storefront_purchasable !== undefined) checkEnum(commerce.storefront_purchasable, "commerce.storefront_purchasable", PURCHASABILITY_VALUES, issues)
    if (commerce.availability_mode !== undefined) checkEnum(commerce.availability_mode, "commerce.availability_mode", AVAILABILITY_MODES, issues)
  }

  const physical = checkSectionObject(record, "physical", ["weight", "dimensions", "material", "package_dimensions", "package_weight"], new Set(["weight", "dimensions", "material", "package_dimensions", "package_weight"]), issues)
  if (physical) {
    checkMeasurementShape(physical.weight, "physical.weight", issues)
    checkDimensionsShape(physical.dimensions, "physical.dimensions", issues)
    checkStringOrNull(physical.material, "physical.material", issues)
    checkDimensionsShape(physical.package_dimensions, "physical.package_dimensions", issues)
    checkMeasurementShape(physical.package_weight, "physical.package_weight", issues)
  }

  const content = checkSectionObject(record, "content", ["short_description", "long_description", "feature_bullets", "care_instructions", "specifications"], new Set(["short_description", "long_description", "feature_bullets", "care_instructions", "specifications"]), issues)
  if (content) {
    for (const key of ["short_description", "long_description", "care_instructions"]) checkStringOrNull(content[key], `content.${key}`, issues)
    checkStringArray(content.feature_bullets, "content.feature_bullets", issues)
    if (!isPlainObject(content.specifications)) schemaIssue(issues, "content.specifications", "Specifications must be an object.")
  }

  const taxonomy = checkSectionObject(record, "taxonomy", ["pet_type", "product_category", "collection", "tags"], new Set(["pet_type", "product_category", "collection", "tags"]), issues)
  if (taxonomy) {
    for (const key of ["pet_type", "product_category", "collection"]) checkStringOrNull(taxonomy[key], `taxonomy.${key}`, issues)
    checkStringArray(taxonomy.tags, "taxonomy.tags", issues)
  }

  const assets = checkSectionObject(record, "assets", ["main_image", "gallery_images", "lifestyle_images", "thumbnail"], new Set(["main_image", "gallery_images", "lifestyle_images", "thumbnail"]), issues)
  if (assets) {
    checkAssetShape(assets.main_image, "assets.main_image", issues)
    if (!Array.isArray(assets.gallery_images)) schemaIssue(issues, "assets.gallery_images", "Gallery images must be an array of asset objects.")
    else assets.gallery_images.forEach((asset, index) => checkAssetShape(asset, `assets.gallery_images[${index}]`, issues))
    if (!Array.isArray(assets.lifestyle_images)) schemaIssue(issues, "assets.lifestyle_images", "Lifestyle images must be an array of asset objects.")
    else assets.lifestyle_images.forEach((asset, index) => checkAssetShape(asset, `assets.lifestyle_images[${index}]`, issues))
    checkAssetShape(assets.thumbnail, "assets.thumbnail", issues)
  }

  const operations = checkSectionObject(record, "operations", ["moq", "supplier_lead_time", "domestic_shipping_notes", "fulfillment_notes"], new Set(["moq", "supplier_lead_time", "domestic_shipping_notes", "fulfillment_notes"]), issues)
  if (operations) {
    checkNumberOrUnknown(operations.moq, "operations.moq", issues)
    checkStringOrNull(operations.supplier_lead_time, "operations.supplier_lead_time", issues)
    checkStringOrNull(operations.domestic_shipping_notes, "operations.domestic_shipping_notes", issues)
    checkStringOrNull(operations.fulfillment_notes, "operations.fulfillment_notes", issues)
  }

  const crossBorder = checkSectionObject(record, "cross_border", ["country_of_origin", "hs_code", "compliance_notes", "restricted_material_notes"], new Set(["country_of_origin", "hs_code", "compliance_notes", "restricted_material_notes"]), issues)
  if (crossBorder) {
    checkStringOrNull(crossBorder.country_of_origin, "cross_border.country_of_origin", issues)
    checkHsShape(crossBorder.hs_code, "cross_border.hs_code", issues)
    checkStringOrNull(crossBorder.compliance_notes, "cross_border.compliance_notes", issues)
    checkStringOrNull(crossBorder.restricted_material_notes, "cross_border.restricted_material_notes", issues)
  }

  const provenance = checkSectionObject(record, "provenance", ["source_url", "source_evidence", "status", "last_verified_date"], new Set(["source_url", "source_evidence", "status", "last_verified_date"]), issues)
  if (provenance) {
    checkStringOrNull(provenance.source_url, "provenance.source_url", issues)
    if (!Array.isArray(provenance.source_evidence)) schemaIssue(issues, "provenance.source_evidence", "Source evidence must be an array of strings.")
    else provenance.source_evidence.forEach((entry, index) => checkStringOrNull(entry, `provenance.source_evidence[${index}]`, issues))
    if (typeof provenance.status !== "string" || !new Set(["VERIFIED", "UNVERIFIED", "NEEDS_VERIFICATION"]).has(provenance.status)) schemaIssue(issues, "provenance.status", "Unsupported provenance status.")
    checkStringOrNull(provenance.last_verified_date, "provenance.last_verified_date", issues)
  }
  return issues
}

function requiredField(record, issues, gate, field, classification = blockerLabel(gate)) {
  const value = get(record, field)
  if (isUnknown(value)) issue(issues, gate, field, "MISSING", "Required fact is missing or explicitly unknown.", classification, "BLOCKER")
  return value
}

function checkUrl(record, issues, gate, field, required = false) {
  const value = get(record, field)
  if (isUnknown(value)) {
    if (required) issue(issues, gate, field, "MISSING", "Source URL is required for traceability.", blockerLabel(gate), "BLOCKER")
    return
  }
  try {
    const parsed = new URL(value)
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("URL must use HTTP or HTTPS")
  } catch (error) {
    issue(issues, gate, field, "INVALID", error.message, blockerLabel(gate), "BLOCKER")
  }
}

function checkAssetUrl(issues, field, asset) {
  if (!asset || typeof asset !== "object" || isUnknown(asset.url)) return
  try {
    const parsed = new URL(asset.url)
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("Asset URL must use HTTP or HTTPS")
  } catch (error) {
    issue(issues, "PUBLISH_REQUIRED", field, "INVALID", error.message, blockerLabel("PUBLISH_REQUIRED"), "BLOCKER")
  }
}

function checkCurrency(record, issues) {
  const value = get(record, "commerce.currency")
  if (isUnknown(value)) {
    issue(issues, "IMPORT_REQUIRED", "commerce.currency", "MISSING", "Currency is required and supported currencies are USD and EUR.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
    return "MISSING"
  }
  if (!SUPPORTED_CURRENCIES.has(value)) {
    issue(issues, "IMPORT_REQUIRED", "commerce.currency", "INVALID", "Only supported currencies USD and EUR are accepted.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
    return "INVALID"
  }
  return "PASS"
}

function checkPrice(issues, gate, field, value, required = false) {
  if (isUnknown(value)) {
    if (required) issue(issues, gate, field, "MISSING", "A positive selling price is required.", blockerLabel(gate), "BLOCKER")
    return false
  }
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    issue(issues, gate, field, "INVALID", "Price must be a finite number greater than zero.", blockerLabel(gate), "BLOCKER")
    return false
  }
  return true
}

function checkMeasurement(issues, field, measurement) {
  const value = measurement?.value
  const unit = measurement?.unit
  if (isUnknown(value) || isUnknown(unit)) {
    issue(issues, "LOGISTICS_REQUIRED", field, "MISSING", "Measurement value and controlled unit are required for logistics.", "logistics blocker", "NEEDS_VERIFICATION")
    return "NEEDS_VERIFICATION"
  }
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0 || !WEIGHT_UNITS.has(unit)) {
    issue(issues, "LOGISTICS_REQUIRED", field, "INVALID", "Weight must be a finite number greater than zero with unit g, kg, oz or lb.", "logistics blocker", "BLOCKER")
    return "BLOCKED"
  }
  return "PASS"
}

function checkInventoryStatus(issues, gate, field, value) {
  if (isUnknown(value)) {
    issue(issues, gate, field, "UNVERIFIED", "Inventory/purchasability status is not explicit.", blockerLabel(gate), "NEEDS_VERIFICATION")
    return
  }
  if (!INVENTORY_STATUSES.has(String(value).toUpperCase())) issue(issues, gate, field, "INVALID", "Use an explicit supported inventory status.", blockerLabel(gate), "BLOCKER")
}

function hasExplicitLocalPreviewAvailability(record, variants) {
  const commerce = record.commerce || {}
  return commerce.supplier_stock_status === "AVAILABLE" &&
    commerce.storefront_purchasable === "YES" &&
    commerce.availability_mode === "LOCAL_PREVIEW_AVAILABILITY" &&
    commerce.project_owned_inventory === "UNKNOWN" &&
    Array.isArray(variants) &&
    variants.length > 0 &&
    variants.every((variant) => variant.storefront_purchasable === "YES")
}

function checkDimensions(issues, field, dimensions) {
  if (!dimensions) {
    issue(issues, "LOGISTICS_REQUIRED", field, "MISSING", "Dimensions and unit are required for the logistics gate.", "logistics blocker", "NEEDS_VERIFICATION")
    return "NEEDS_VERIFICATION"
  }
  const values = [dimensions.length, dimensions.width, dimensions.height]
  if (values.some(isUnknown) || isUnknown(dimensions.unit)) {
    issue(issues, "LOGISTICS_REQUIRED", field, "MISSING", "All dimensions and a controlled unit must be verified for logistics.", "logistics blocker", "NEEDS_VERIFICATION")
    return "NEEDS_VERIFICATION"
  }
  const numbers = values.map((value) => typeof value === "number" ? value : Number(value))
  if (numbers.some((value) => !Number.isFinite(value) || value <= 0) || !DIMENSION_UNITS.has(dimensions.unit)) {
    issue(issues, "LOGISTICS_REQUIRED", field, "INVALID", "Length, width and height must be finite and greater than zero with unit mm, cm, m or in.", "logistics blocker", "BLOCKER")
    return "BLOCKED"
  }
  return "PASS"
}

function checkHsCode(issues, hsCode) {
  if (isUnknown(hsCode?.value)) {
    issue(issues, "LOGISTICS_REQUIRED", "cross_border.hs_code", "UNVERIFIED", "HS code value is missing; do not infer one.", "logistics blocker", "NEEDS_VERIFICATION")
    return "NEEDS_VERIFICATION"
  }
  if (hsCode.status !== "VERIFIED") {
    issue(issues, "LOGISTICS_REQUIRED", "cross_border.hs_code.status", "UNVERIFIED", "Known HS code values require status VERIFIED.", "logistics blocker", "NEEDS_VERIFICATION")
    return "NEEDS_VERIFICATION"
  }
  if (isUnknown(hsCode.evidence)) {
    issue(issues, "LOGISTICS_REQUIRED", "cross_border.hs_code.evidence", "MISSING", "A verified HS code must include evidence.", "logistics blocker", "NEEDS_VERIFICATION")
    return "NEEDS_VERIFICATION"
  }
  return "PASS"
}

function validateRecord(record) {
  const schemaIssues = validateSchemaShape(record)
  if (schemaIssues.length > 0) {
    return {
      result: "BLOCKED",
      schema_valid: false,
      dry_run_not_attempted: true,
      checks: { currency: "NOT_ATTEMPTED", hs_code: "NOT_ATTEMPTED" },
      gates: { IMPORT_REQUIRED: "BLOCKED", PUBLISH_REQUIRED: "BLOCKED", LOGISTICS_REQUIRED: "BLOCKED" },
      issue_count: schemaIssues.length,
      issues: schemaIssues,
    }
  }

  const issues = []
  const currencyStatus = checkCurrency(record, issues)
  if (record.schema_version !== CURRENT_SCHEMA_VERSION) issue(issues, "IMPORT_REQUIRED", "schema_version", "INVALID", `Expected Product Master schema version ${CURRENT_SCHEMA_VERSION}.`, "import blocker", "BLOCKER")
  for (const field of ["identity.source_product_id", "identity.internal_sku", "identity.handle", "identity.title"]) requiredField(record, issues, "IMPORT_REQUIRED", field)
  const draftIntegration = record.record_status === "DRAFT"
  const productPriceKnown = checkPrice(issues, "IMPORT_REQUIRED", "commerce.selling_price", get(record, "commerce.selling_price"), !draftIntegration)
  const productCompareAt = get(record, "commerce.compare_at_price")
  if (isKnown(productCompareAt) && productPriceKnown && Number(productCompareAt) < Number(get(record, "commerce.selling_price"))) issue(issues, "IMPORT_REQUIRED", "commerce.compare_at_price", "INVALID", "Compare-at price cannot be lower than selling price.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
  checkUrl(record, issues, "IMPORT_REQUIRED", "provenance.source_url", true)
  const evidence = get(record, "provenance.source_evidence")
  if (!Array.isArray(evidence) || evidence.length === 0) issue(issues, "IMPORT_REQUIRED", "provenance.source_evidence", "MISSING", "At least one source evidence reference is required.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")

  const variants = get(record, "commerce.variants")
  const variantSkus = new Set()
  const optionNames = Array.isArray(get(record, "commerce.option_names")) ? get(record, "commerce.option_names") : []
  if (new Set(optionNames).size !== optionNames.length) issue(issues, "IMPORT_REQUIRED", "commerce.option_names", "INVALID", "Option names must be unique.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
  if (!Array.isArray(variants) || variants.length === 0) issue(issues, "IMPORT_REQUIRED", "commerce.variants", "MISSING", "At least one real variant is required.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
  else variants.forEach((variant, index) => {
    const prefix = `commerce.variants[${index}]`
    const sku = variant.internal_sku
    if (isUnknown(sku)) issue(issues, "IMPORT_REQUIRED", `${prefix}.internal_sku`, "MISSING", "Each variant needs a stable internal SKU.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
    else if (variantSkus.has(String(sku))) issue(issues, "IMPORT_REQUIRED", `${prefix}.internal_sku`, "INVALID", "Variant SKU is duplicated within this record.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
    else variantSkus.add(String(sku))
    const variantPrice = variant.selling_price ?? get(record, "commerce.selling_price")
    checkPrice(issues, "IMPORT_REQUIRED", `${prefix}.selling_price`, variantPrice, !productPriceKnown && !draftIntegration)
    if (variant.options && typeof variant.options === "object") {
      const variantOptionNames = Object.keys(variant.options)
      if (variantOptionNames.some((name) => !optionNames.includes(name))) issue(issues, "IMPORT_REQUIRED", `${prefix}.options`, "INVALID", "Variant options must be declared in commerce.option_names.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
      if (variantOptionNames.length !== optionNames.length || optionNames.some((name) => !Object.prototype.hasOwnProperty.call(variant.options, name) || isUnknown(variant.options[name]))) issue(issues, "IMPORT_REQUIRED", `${prefix}.options`, "MISSING", "Every declared option needs exactly one value for every variant.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
    } else if (optionNames.length > 0) issue(issues, "IMPORT_REQUIRED", `${prefix}.options`, "MISSING", "Variants must provide values for the declared options.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
    if (isKnown(variant.compare_at_price) && isKnown(variantPrice) && Number(variant.compare_at_price) < Number(variantPrice)) issue(issues, "IMPORT_REQUIRED", `${prefix}.compare_at_price`, "INVALID", "Compare-at price cannot be lower than selling price.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
    if (isKnown(variant.inventory_quantity) && (!Number.isInteger(Number(variant.inventory_quantity)) || Number(variant.inventory_quantity) < 0)) issue(issues, "PUBLISH_REQUIRED", `${prefix}.inventory_quantity`, "INVALID", "Inventory quantity must be a finite non-negative integer.", blockerLabel("PUBLISH_REQUIRED"), "BLOCKER")
  })

  if (isKnown(get(record, "commerce.inventory_quantity")) && (!Number.isInteger(Number(get(record, "commerce.inventory_quantity"))) || Number(get(record, "commerce.inventory_quantity")) < 0)) issue(issues, "PUBLISH_REQUIRED", "commerce.inventory_quantity", "INVALID", "Inventory quantity must be a finite non-negative integer.", blockerLabel("PUBLISH_REQUIRED"), "BLOCKER")

  const productPrice = get(record, "commerce.selling_price")
  if (isKnown(productPrice) && Array.isArray(variants) && record.metadata?.variant_price_differences_verified !== "YES") {
    variants.forEach((variant, index) => {
      if (isKnown(variant.selling_price) && Number(variant.selling_price) !== Number(productPrice)) issue(issues, "IMPORT_REQUIRED", `commerce.variants[${index}].selling_price`, "INVALID", "Variant price differs from the product price without explicit verified price-difference evidence.", blockerLabel("IMPORT_REQUIRED"), "BLOCKER")
    })
  }

  const userApprovedStoreIntegration = record.metadata?.store_integration_approved_by_user === "YES" && record.metadata?.store_integration_gate === "APPROVED_FOR_STORE_INTEGRATION"
  if (!userApprovedStoreIntegration) requiredField(record, issues, "PUBLISH_REQUIRED", "identity.supplier_name", "publish blocker")
  const mainImage = get(record, "assets.main_image")
  if (!mainImage || typeof mainImage !== "object" || isUnknown(mainImage.url) || isUnknown(mainImage.alt) || isUnknown(mainImage.source)) issue(issues, "PUBLISH_REQUIRED", "assets.main_image", "MISSING", "A real main image with url, alt and source is required to publish.", blockerLabel("PUBLISH_REQUIRED"), "NEEDS_VERIFICATION")
  else {
    checkAssetUrl(issues, "assets.main_image.url", mainImage)
    if (mainImage.status !== "VERIFIED" || String(mainImage.url).includes("example.invalid")) issue(issues, "PUBLISH_REQUIRED", "assets.main_image", "UNVERIFIED", "Main image must be a real, verified product asset.", blockerLabel("PUBLISH_REQUIRED"), "NEEDS_VERIFICATION")
  }
  for (const [field, assets] of [["assets.gallery_images", get(record, "assets.gallery_images")], ["assets.lifestyle_images", get(record, "assets.lifestyle_images")]]) {
    if (Array.isArray(assets)) assets.forEach((asset, index) => checkAssetUrl(issues, `${field}[${index}].url`, asset))
  }
  checkAssetUrl(issues, "assets.thumbnail.url", get(record, "assets.thumbnail"))
  const hasDescription = isKnown(get(record, "content.short_description")) || isKnown(get(record, "content.long_description"))
  if (!hasDescription) issue(issues, "PUBLISH_REQUIRED", "content.short_description/content.long_description", "MISSING", "Customer-facing description is required to publish.", blockerLabel("PUBLISH_REQUIRED"), "NEEDS_VERIFICATION")
  if (!userApprovedStoreIntegration && get(record, "provenance.status") !== "VERIFIED") issue(issues, "PUBLISH_REQUIRED", "provenance.status", "UNVERIFIED", "Supplier/source provenance is not verified.", blockerLabel("PUBLISH_REQUIRED"), "NEEDS_VERIFICATION")
  if (!hasExplicitLocalPreviewAvailability(record, variants)) {
    checkInventoryStatus(issues, "PUBLISH_REQUIRED", "commerce.inventory_status", get(record, "commerce.inventory_status"))
    if (Array.isArray(variants)) variants.forEach((variant, index) => checkInventoryStatus(issues, "PUBLISH_REQUIRED", `commerce.variants[${index}].inventory_status`, variant.inventory_status))
  }
  if (record.record_status === "TEST_FIXTURE_ONLY" || record.record_type === "TEST_FIXTURE_ONLY") issue(issues, "PUBLISH_REQUIRED", "record_status", "BLOCKED", "Test fixture records cannot be published as formal products.", blockerLabel("PUBLISH_REQUIRED"), "BLOCKER")
  if (get(record, "commerce.project_owned_inventory") === "UNKNOWN" || get(record, "commerce.availability_mode") === "LOCAL_PREVIEW_AVAILABILITY") issue(issues, "PUBLISH_REQUIRED", "commerce.project_owned_inventory", "BLOCKED", "Local preview availability is not formal production inventory; publish requires explicit owned inventory and fulfillment data.", blockerLabel("PUBLISH_REQUIRED"), "BLOCKER")

  const weightStatus = checkMeasurement(issues, "physical.weight", get(record, "physical.weight"))
  const productDimensionsStatus = checkDimensions(issues, "physical.dimensions", get(record, "physical.dimensions"))
  const dimensionsStatus = checkDimensions(issues, "physical.package_dimensions", get(record, "physical.package_dimensions"))
  const packageWeightStatus = checkMeasurement(issues, "physical.package_weight", get(record, "physical.package_weight"))
  if (isUnknown(get(record, "cross_border.country_of_origin"))) issue(issues, "LOGISTICS_REQUIRED", "cross_border.country_of_origin", "MISSING", "Country of origin is required for cross-border logistics review.", blockerLabel("LOGISTICS_REQUIRED"), "NEEDS_VERIFICATION")
  const hsStatus = checkHsCode(issues, get(record, "cross_border.hs_code"))

  const hasHardBlocker = issues.some((entry) => entry.severity === "BLOCKER" && !(draftIntegration && (entry.gate === "PUBLISH_REQUIRED" || entry.gate === "LOGISTICS_REQUIRED")))
  const result = hasHardBlocker ? "BLOCKED" : issues.length > 0 ? "NEEDS_VERIFICATION" : "PASS"
  const gateResult = (gate) => {
    const gateIssues = issues.filter((entry) => entry.gate === gate)
    if (gateIssues.some((entry) => entry.severity === "BLOCKER")) return "BLOCKED"
    return gateIssues.length > 0 ? "NEEDS_VERIFICATION" : "PASS"
  }
  return {
    result,
    schema_valid: true,
    dry_run_not_attempted: false,
    checks: { currency: currencyStatus, purchasability: hasExplicitLocalPreviewAvailability(record, variants) ? "PASS" : "NEEDS_VERIFICATION", hs_code: hsStatus, weight: weightStatus, dimensions: productDimensionsStatus, package_dimensions: dimensionsStatus, package_weight: packageWeightStatus },
    gates: { IMPORT_REQUIRED: gateResult("IMPORT_REQUIRED"), PUBLISH_REQUIRED: gateResult("PUBLISH_REQUIRED"), LOGISTICS_REQUIRED: gateResult("LOGISTICS_REQUIRED") },
    issue_count: issues.length,
    issues,
  }
}

function normalizeValue(value) {
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeValue(child)]))
  if (typeof value === "string") return value.trim() || null
  return value
}

function normalizeNumber(value) {
  if (isUnknown(value) || typeof value === "number") return value
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value)
  return value
}

function normalizeUnit(value, units) {
  if (typeof value !== "string") return value
  const upper = value.toUpperCase()
  if (UNKNOWN_MARKERS.has(upper)) return upper === "NEEDS_VERIFICATION" ? "NEEDS_VERIFICATION" : "UNKNOWN"
  const lower = value.toLowerCase()
  return units.has(lower) ? lower : value
}

function normalizeRecord(record) {
  if (record?.schema_version !== CURRENT_SCHEMA_VERSION) throw new Error(`SCHEMA_UPGRADE_REQUIRED: input must use schema_version ${CURRENT_SCHEMA_VERSION}; old 1.0.0 weight values are not inferred.`)
  const structuralIssues = validateSchemaShape(record)
  if (structuralIssues.length > 0) throw new Error(`SCHEMA_VALIDATION_FAILED: ${structuralIssues[0].field}`)
  const normalized = normalizeValue(record)
  if (typeof normalized.commerce?.currency === "string") normalized.commerce.currency = normalized.commerce.currency.toUpperCase()
  if (typeof normalized.identity?.handle === "string") normalized.identity.handle = normalized.identity.handle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  for (const field of ["cost_price", "selling_price", "compare_at_price", "inventory_quantity"]) if (normalized.commerce) normalized.commerce[field] = normalizeNumber(normalized.commerce[field])
  for (const field of ["weight", "package_weight"]) if (normalized.physical?.[field]) {
    normalized.physical[field].value = normalizeNumber(normalized.physical[field].value)
    normalized.physical[field].unit = normalizeUnit(normalized.physical[field].unit, WEIGHT_UNITS)
  }
  for (const field of ["dimensions", "package_dimensions"]) if (normalized.physical?.[field]) {
    for (const key of ["length", "width", "height"]) normalized.physical[field][key] = normalizeNumber(normalized.physical[field][key])
    normalized.physical[field].unit = normalizeUnit(normalized.physical[field].unit, DIMENSION_UNITS)
  }
  if (normalized.cross_border?.hs_code) {
    normalized.cross_border.hs_code.value = typeof normalized.cross_border.hs_code.value === "string" ? normalized.cross_border.hs_code.value.trim() || null : normalized.cross_border.hs_code.value
    if (typeof normalized.cross_border.hs_code.status === "string") normalized.cross_border.hs_code.status = normalized.cross_border.hs_code.status.toUpperCase()
  }
  if (Array.isArray(normalized.commerce?.variants)) normalized.commerce.variants = normalized.commerce.variants.map((variant) => ({
    ...variant,
    selling_price: normalizeNumber(variant.selling_price),
    compare_at_price: normalizeNumber(variant.compare_at_price),
    inventory_quantity: normalizeNumber(variant.inventory_quantity),
  }))
  return normalized
}

function assetUrl(asset) {
  return asset && typeof asset === "object" && !isUnknown(asset.url) ? asset.url : null
}

function medusaRuntimeAmount(value) {
  // The frozen Mother Template's migration seed and storefront formatter use
  // Medusa amounts in currency units (for example 14.99), not minor units.
  if (isUnknown(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildMedusaPlan(record, validation) {
  const normalized = normalizeRecord(record)
  const commerce = normalized.commerce || {}
  const localPreviewAvailability = commerce.availability_mode === "LOCAL_PREVIEW_AVAILABILITY" && commerce.storefront_purchasable === "YES"
  const payload = buildPublicMedusaPayload(normalized, {
    status: normalized.record_status === "PUBLISHED" ? "published" : "draft",
    inventoryMode: localPreviewAvailability ? "LOCAL_PREVIEW_AVAILABILITY" : normalized.commerce?.availability_mode,
  })
  return {
    pipeline: "PAWFECTLY_PRODUCT_MASTER_TO_MEDUSA",
    validation_result: validation.result,
    import_gate: validation.gates.IMPORT_REQUIRED,
    write_performed: false,
    operation: "DRY_RUN_ONLY_UPSERT_BY_SOURCE_PRODUCT_ID_AND_SKU",
    source_record_status: normalized.record_status,
    medusa_payload: payload,
    warnings: [
      "No HTTP request was made.",
      "No catalog reset or destructive operation is available in this command.",
      ...(normalized.record_status === "TEST_FIXTURE_ONLY" ? ["TEST_FIXTURE_ONLY record must not be imported or published."] : []),
    ],
  }
}

function writeOutput(outputPath, value) {
  if (!outputPath) return
  const absolutePath = path.resolve(outputPath)
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  return absolutePath
}

function printValidation(validation, asJson) {
  if (asJson) { console.log(JSON.stringify(validation, null, 2)); return }
  console.log(`VALIDATE_RESULT=${validation.result}`)
  console.log(`VALIDATION_RESULT=${validation.result}`)
  if (validation.dry_run_not_attempted) console.log("DRY_RUN_NOT_ATTEMPTED")
  for (const [gate, result] of Object.entries(validation.gates)) console.log(`${gate}=${result}`)
  console.log(`SCHEMA_VALID=${validation.schema_valid ? "YES" : "NO"}`)
  console.log(`ISSUE_COUNT=${validation.issue_count}`)
  for (const entry of validation.issues) console.log(`${entry.state}|${entry.gate}|${entry.field}|${entry.classification}|${entry.message}`)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function issueFor(result, field) {
  return result.issues.some((entry) => entry.field === field || entry.field.startsWith(`${field}.`))
}

function runSelfTests(options) {
  const fixture = readRecord(options.input || path.resolve("05_product/intake/TEST_FIXTURE_ONLY.medusa-seed.json"))
  const templatePath = path.resolve(path.dirname(options.input || "05_product/intake/TEST_FIXTURE_ONLY.medusa-seed.json"), "PRODUCT_INTAKE_TEMPLATE.json")
  const blank = readRecord(templatePath)
  const cases = []
  const add = (name, passed, detail = "") => cases.push({ name, passed: Boolean(passed), detail })
  const blocked = (record) => { const result = validateRecord(record); return result.result === "BLOCKED" && result.schema_valid === false && result.dry_run_not_attempted === true }

  add("BLANK_INTAKE_BLOCKED", validateRecord(blank).result === "BLOCKED")
  add("TEST_FIXTURE_BLOCKS_PUBLISH", validateRecord(fixture).result === "BLOCKED" && validateRecord(fixture).gates.IMPORT_REQUIRED === "PASS" && validateRecord(fixture).gates.PUBLISH_REQUIRED === "BLOCKED")
  add("MALFORMED_GALLERY_BLOCKED", blocked({ ...clone(fixture), assets: { ...clone(fixture.assets), gallery_images: "not-an-array" } }))
  add("MALFORMED_VARIANTS_BLOCKED", blocked({ ...clone(fixture), commerce: { ...clone(fixture.commerce), variants: {} } }))
  add("MALFORMED_MAIN_IMAGE_BLOCKED", blocked({ ...clone(fixture), assets: { ...clone(fixture.assets), main_image: "not-an-asset" } }))
  add("MALFORMED_DIMENSION_VALUE_BLOCKED", blocked({ ...clone(fixture), physical: { ...clone(fixture.physical), package_dimensions: { ...clone(fixture.physical.package_dimensions), length: "abc" } } }))
  add("MALFORMED_CURRENCY_BLOCKED", blocked({ ...clone(fixture), commerce: { ...clone(fixture.commerce), currency: {} } }))
  add("NEGATIVE_DIMENSION_BLOCKED", blocked({ ...clone(fixture), physical: { ...clone(fixture.physical), package_dimensions: { ...clone(fixture.physical.package_dimensions), length: -1 } } }))
  add("NEGATIVE_PRODUCT_DIMENSION_BLOCKED", blocked({ ...clone(fixture), physical: { ...clone(fixture.physical), dimensions: { ...clone(fixture.physical.dimensions), width: -1 } } }))
  const nanDimensions = clone(fixture)
  nanDimensions.physical.package_dimensions.height = Number.NaN
  add("NAN_DIMENSION_BLOCKED", blocked(nanDimensions))
  add("ZERO_PACKAGE_DIMENSION_BLOCKED", blocked({ ...clone(fixture), physical: { ...clone(fixture.physical), package_dimensions: { ...clone(fixture.physical.package_dimensions), length: 0 } } }))
  add("INVALID_DIMENSION_UNIT_BLOCKED", blocked({ ...clone(fixture), physical: { ...clone(fixture.physical), package_dimensions: { ...clone(fixture.physical.package_dimensions), unit: "bananas" } } }))
  add("WEIGHT_WITHOUT_UNIT_BLOCKED", blocked({ ...clone(fixture), physical: { ...clone(fixture.physical), weight: 100 } }))
  add("WEIGHT_OBJECT_WITHOUT_UNIT_BLOCKED", blocked({ ...clone(fixture), physical: { ...clone(fixture.physical), weight: { value: 100 } } }))
  const weightUnknownUnit = clone(fixture)
  weightUnknownUnit.physical.weight = { value: 100, unit: "UNKNOWN" }
  add("WEIGHT_UNKNOWN_UNIT_NOT_PASS", validateRecord(weightUnknownUnit).checks.weight === "NEEDS_VERIFICATION")
  const hsUnverified = clone(fixture)
  hsUnverified.cross_border.hs_code = { value: "1234", status: "NEEDS_VERIFICATION", evidence: null }
  const hsUnverifiedResult = validateRecord(hsUnverified)
  add("HS_VALUE_WITHOUT_VERIFIED_NOT_PASS", hsUnverifiedResult.checks.hs_code === "NEEDS_VERIFICATION" && issueFor(hsUnverifiedResult, "cross_border.hs_code"))
  const hsNoEvidence = clone(fixture)
  hsNoEvidence.cross_border.hs_code = { value: "1234", status: "VERIFIED", evidence: null }
  add("HS_VERIFIED_WITHOUT_EVIDENCE_NOT_PASS", validateRecord(hsNoEvidence).checks.hs_code === "NEEDS_VERIFICATION")
  const hsVerified = clone(fixture)
  hsVerified.cross_border.hs_code = { value: "1234", status: "VERIFIED", evidence: "supplier customs document" }
  add("HS_VERIFIED_WITH_EVIDENCE_PASS", validateRecord(hsVerified).checks.hs_code === "PASS" && !issueFor(validateRecord(hsVerified), "cross_border.hs_code"))
  add("UNSUPPORTED_CURRENCY_BLOCKED", blocked({ ...clone(fixture), commerce: { ...clone(fixture.commerce), currency: "CNY" } }))
  add("USD_CURRENCY_CHECK_PASS", validateRecord(fixture).checks.currency === "PASS")
  const eurFixture = clone(fixture)
  eurFixture.commerce.currency = "EUR"
  add("EUR_CURRENCY_CHECK_PASS", validateRecord(eurFixture).checks.currency === "PASS" && buildMedusaPlan(eurFixture, validateRecord(eurFixture)).medusa_payload.variants[0].prices[0].amount === 10)
  const normalizedOnce = normalizeRecord(fixture)
  const normalizedTwice = normalizeRecord(normalizedOnce)
  add("NORMALIZE_IDEMPOTENT", JSON.stringify(normalizedOnce) === JSON.stringify(normalizedTwice))
  const dryRun = buildMedusaPlan(fixture, validateRecord(fixture))
  add("DRY_RUN_WRITE_PERFORMED_NO", dryRun.write_performed === false && dryRun.warnings.some((warning) => warning.includes("No HTTP request")))
  add("PUBLIC_METADATA_EXCLUDES_SOURCING", !Object.keys(dryRun.medusa_payload.metadata).some((key) => /cost|supplier|operations|cross_border|physical|hs_code|provenance/i.test(key)))
  const twoVariant = clone(fixture)
  twoVariant.commerce.option_names = ["Size"]
  twoVariant.commerce.variants.push({ ...clone(twoVariant.commerce.variants[0]), internal_sku: "TEST_FIXTURE_ONLY-PRODUCT-L", options: { Size: "L" }, selling_price: 12 })
  const twoVariantPlan = buildMedusaPlan(twoVariant, validateRecord(twoVariant))
  add("DRY_RUN_MAPS_ALL_VARIANTS", twoVariantPlan.medusa_payload.variants.length === 2 && twoVariantPlan.medusa_payload.variants.every((variant) => variant.sku))
  add("SECOND_VARIANT_PRICE_MISMATCH_BLOCKS_PUBLISH", validateRecord(twoVariant).gates.PUBLISH_REQUIRED === "BLOCKED")
  const oldVersion = clone(fixture)
  oldVersion.schema_version = "1.0.0"
  let oldRejected = false
  try { normalizeRecord(oldVersion) } catch (error) { oldRejected = error.message.startsWith("SCHEMA_UPGRADE_REQUIRED") }
  add("OLD_SCHEMA_REQUIRES_EXPLICIT_UPGRADE", oldRejected)

  for (const testCase of cases) console.log(`CASE_${testCase.name}=${testCase.passed ? "PASS" : "FAIL"}${testCase.detail ? `|${testCase.detail}` : ""}`)
  const passed = cases.every((testCase) => testCase.passed)
  console.log(`VALIDATION_TEST_MATRIX=${passed ? "PASS" : "FAIL"}`)
  return passed ? 0 : 2
}

function printHelp() {
  console.log(`Usage:\n  node 05_product/scripts/product-pipeline.mjs validate --input <file> [--json]\n  node 05_product/scripts/product-pipeline.mjs normalize --input <file> [--output <file>]\n  node 05_product/scripts/product-pipeline.mjs dry-run --input <file> [--output <file>] [--json]\n  node 05_product/scripts/product-pipeline.mjs test --input <fixture>\n\nThe dry-run command emits a request-shaped Medusa mapping and always reports WRITE_PERFORMED=NO.`)
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.mode === "help" || options.mode === "--help") { printHelp(); process.exit(0) }
  if (options.mode === "test") { process.exitCode = runSelfTests(options); }
  else {
    const record = readRecord(options.input)
    const validation = validateRecord(record)
    if (options.mode === "validate") {
      printValidation(validation, options.json)
      process.exitCode = validation.result === "BLOCKED" ? 2 : 0
    } else if (options.mode === "normalize") {
      const normalized = normalizeRecord(record)
      const outputPath = writeOutput(options.output, normalized)
      if (outputPath) console.log(`NORMALIZED_OUTPUT=${outputPath}`)
      else console.log(JSON.stringify(normalized, null, 2))
    } else if (options.mode === "dry-run") {
      if (validation.result === "BLOCKED" && validation.gates.IMPORT_REQUIRED !== "PASS") { printValidation(validation, options.json); process.exitCode = 2 }
      else {
        const plan = buildMedusaPlan(record, validation)
        const outputPath = writeOutput(options.output, plan)
        if (options.json) console.log(JSON.stringify(plan, null, 2))
        else {
          console.log(`DRY_RUN_RESULT=${validation.result}`)
          console.log(`IMPORT_GATE=${validation.gates.IMPORT_REQUIRED}`)
          console.log("WRITE_PERFORMED=NO")
          console.log("MEDUSA_MAPPING=READY_FOR_REVIEW")
          if (outputPath) console.log(`PLAN_OUTPUT=${outputPath}`)
        }
      }
    } else throw new Error(`Unknown mode: ${options.mode}`)
  }
} catch (error) {
  console.error(`ERROR=${error.message}`)
  process.exitCode = 1
}
