#!/usr/bin/env node

import { readFileSync } from "node:fs"
import path from "node:path"

const COMPONENT_SCHEMA_VERSION = "1.0.0"
const BUNDLE_ID = "BUNDLE-PET-FUR-RESCUE-KIT"
const COMPONENT_TYPES = new Set(["CORE_COMPONENT", "ACCESSORY_COMPONENT", "PACKAGING_COMPONENT"])
const CANDIDATE_STATUSES = new Set(["CANDIDATE", "SAMPLE_ORDERED", "SAMPLE_RECEIVED", "SAMPLE_TESTING", "SAMPLE_TESTING_PENDING", "APPROVED", "REJECTED"])
const GATE_NAMES = ["SOURCE_GATE", "SAMPLE_GATE", "PROCUREMENT_GATE", "LOGISTICS_GATE", "RISK_GATE"]
const SOURCES = new Set(["SUPPLIER_CLAIM", "IMAGE_EVIDENCE_ONLY", "SUPPLIED_FACT", "PROJECT_DECISION", "UNKNOWN_SOURCE"])
const FACT_STATUSES = new Set(["VERIFIED", "NEEDS_VERIFICATION", "UNKNOWN", "PENDING", "NOT_A_VERIFIED_FACT"])

function parseArgs(argv) {
  const [mode, ...rest] = argv
  const options = { mode: mode || "help" }
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]
    if (argument === "--json") { options.json = true; continue }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`)
    const key = argument.slice(2)
    const value = rest[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`)
    options[key] = value
    index += 1
  }
  return options
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isUnknown(value) {
  return value === null || value === undefined || (typeof value === "string" && ["", "UNKNOWN", "NEEDS_VERIFICATION", "N/A", "TBD"].includes(value.trim().toUpperCase()))
}

function readJson(input) {
  if (!input) throw new Error("Use --input <component or BOM JSON>")
  const absolute = path.resolve(input)
  try {
    const value = JSON.parse(readFileSync(absolute, "utf8"))
    if (!isObject(value)) throw new Error("JSON root must be an object")
    return value
  } catch (error) {
    throw new Error(`Cannot read valid JSON from ${absolute}: ${error.message}`)
  }
}

function get(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value)
}

function addIssue(issues, field, message, severity = "BLOCKER") {
  issues.push({ field, message, severity })
}

function checkKeys(object, required, allowed, field, issues) {
  if (!isObject(object)) { addIssue(issues, field, "Expected an object."); return false }
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(object, key)) addIssue(issues, `${field}.${key}`, "Required property is missing.")
  for (const key of Object.keys(object)) if (!allowed.has(key)) addIssue(issues, `${field}.${key}`, "Unknown property is not allowed by the component schema.")
  return true
}

function checkFact(value, field, issues, allowEvidenceItem = false, extraAllowedKeys = []) {
  if (!isObject(value)) { addIssue(issues, field, "Fact must be an object with value, source and status."); return }
  const required = allowEvidenceItem ? ["source", "status", "statement"] : ["value", "source", "status"]
  const allowed = allowEvidenceItem ? new Set(["source", "status", "statement", "reference"]) : new Set(["value", "source", "status", "evidence", "notes", ...extraAllowedKeys])
  checkKeys(value, required, allowed, field, issues)
  if (typeof value.source !== "string" || !SOURCES.has(value.source)) addIssue(issues, `${field}.source`, "Unsupported evidence source label.")
  if (typeof value.status !== "string" || !FACT_STATUSES.has(value.status)) addIssue(issues, `${field}.status`, "Unsupported fact status.")
  if (value.evidence !== undefined && value.evidence !== null && typeof value.evidence !== "string") addIssue(issues, `${field}.evidence`, "Evidence must be a string or null.")
  if (allowEvidenceItem && typeof value.statement !== "string") addIssue(issues, `${field}.statement`, "Evidence statement must be a string.")
}

function checkMoney(value, field, issues) {
  checkFact(value, field, issues, false, ["currency"])
  if (!isObject(value)) return
  if (typeof value.value !== "number" && value.value !== null) addIssue(issues, `${field}.value`, "Money value must be a number or null.")
  if (typeof value.currency !== "string" || !["USD", "EUR", "UNKNOWN"].includes(value.currency)) addIssue(issues, `${field}.currency`, "Currency must be USD, EUR or UNKNOWN.")
}

function checkQuantity(value, field, issues) {
  checkFact(value, field, issues, false, ["unit"])
  if (!isObject(value)) return
  if (typeof value.value !== "number" && value.value !== null) addIssue(issues, `${field}.value`, "Quantity value must be a number or null.")
  if (typeof value.unit !== "string" || !["units", "cartons", "days", "percent", "UNKNOWN"].includes(value.unit)) addIssue(issues, `${field}.unit`, "Unsupported quantity unit.")
}

function checkMeasurement(value, field, issues) {
  checkFact(value, field, issues, false, ["unit"])
  if (!isObject(value)) return
  if (typeof value.value !== "number" && value.value !== null) addIssue(issues, `${field}.value`, "Measurement value must be a number or null.")
  if (typeof value.unit !== "string" || !["mm", "cm", "m", "g", "kg", "oz", "lb", "UNKNOWN"].includes(value.unit)) addIssue(issues, `${field}.unit`, "Unsupported measurement unit.")
}

function checkDimensions(value, field, issues, productShape = false) {
  const keys = productShape ? ["width", "height", "depth", "unit", "source", "status"] : ["length", "width", "height", "unit", "source", "status"]
  const allowed = new Set([...keys, "evidence"])
  if (!checkKeys(value, keys, allowed, field, issues)) return
  for (const key of productShape ? ["width", "height", "depth"] : ["length", "width", "height"]) if (typeof value[key] !== "number" && value[key] !== null) addIssue(issues, `${field}.${key}`, "Dimension value must be a number or null.")
  if (typeof value.unit !== "string" || !["mm", "cm", "m", "in", "UNKNOWN"].includes(value.unit)) addIssue(issues, `${field}.unit`, "Unsupported dimension unit.")
  if (typeof value.source !== "string" || !SOURCES.has(value.source)) addIssue(issues, `${field}.source`, "Unsupported evidence source label.")
  if (typeof value.status !== "string" || !FACT_STATUSES.has(value.status)) addIssue(issues, `${field}.status`, "Unsupported fact status.")
}

function checkBulkShippingQuote(value, field, issues) {
  const keys = ["destination", "quantity", "mode", "quoted_cost", "currency", "terms", "transit_time", "source", "status", "evidence"]
  if (!checkKeys(value, keys, new Set(keys), field, issues)) return
  if (typeof value.destination !== "string" || value.destination.length === 0) addIssue(issues, `${field}.destination`, "Destination must be a non-empty string.")
  if (typeof value.quantity !== "number" || value.quantity <= 0) addIssue(issues, `${field}.quantity`, "Quantity must be a positive number.")
  if (typeof value.mode !== "string" || value.mode.length === 0) addIssue(issues, `${field}.mode`, "Shipping mode must be a non-empty string.")
  if (typeof value.quoted_cost !== "number" || value.quoted_cost < 0) addIssue(issues, `${field}.quoted_cost`, "Quoted cost must be a non-negative number.")
  if (typeof value.currency !== "string" || !["USD", "EUR"].includes(value.currency)) addIssue(issues, `${field}.currency`, "Quote currency must be USD or EUR.")
  if (typeof value.terms !== "string" || value.terms.length === 0) addIssue(issues, `${field}.terms`, "Terms must be a non-empty string.")
  if (typeof value.transit_time !== "string" || value.transit_time.length === 0) addIssue(issues, `${field}.transit_time`, "Transit time must be a non-empty string.")
  if (typeof value.source !== "string" || !SOURCES.has(value.source)) addIssue(issues, `${field}.source`, "Unsupported evidence source label.")
  if (typeof value.status !== "string" || !FACT_STATUSES.has(value.status)) addIssue(issues, `${field}.status`, "Unsupported quote status.")
  if (value.evidence !== null && typeof value.evidence !== "string") addIssue(issues, `${field}.evidence`, "Evidence must be a string or null.")
}

function validateComponentShape(record) {
  const issues = []
  const sections = ["identity", "role", "cost", "physical", "carton", "variants", "supplier_operations", "cross_border", "risk", "sample", "procurement"]
  const rootAllowed = new Set(["schema_version", "record_type", "bundle_id", ...sections, "metadata"])
  if (!isObject(record)) { addIssue(issues, "root", "Component root must be an object."); return issues }
  checkKeys(record, ["schema_version", "record_type", "bundle_id", ...sections], rootAllowed, "root", issues)
  if (record.schema_version !== COMPONENT_SCHEMA_VERSION) addIssue(issues, "schema_version", `Expected ${COMPONENT_SCHEMA_VERSION}.`)
  if (record.record_type !== "SUPPLY_CHAIN_COMPONENT") addIssue(issues, "record_type", "Expected SUPPLY_CHAIN_COMPONENT.")
  if (typeof record.bundle_id !== "string" && record.bundle_id !== null) addIssue(issues, "bundle_id", "Bundle ID must be a string or null.")

  const identity = record.identity
  if (checkKeys(identity, ["component_id", "source_product_id", "supplier_name", "supplier_url", "source_platform", "source_evidence"], new Set(["component_id", "source_product_id", "supplier_name", "supplier_url", "source_platform", "source_evidence"]), "identity", issues)) {
    for (const key of ["component_id", "source_product_id", "supplier_name", "supplier_url", "source_platform"]) if (typeof identity[key] !== "string" && identity[key] !== null) addIssue(issues, `identity.${key}`, "Expected a string or null.")
    if (!Array.isArray(identity.source_evidence)) addIssue(issues, "identity.source_evidence", "Evidence must be an array.")
    else identity.source_evidence.forEach((item, index) => checkFact(item, `identity.source_evidence[${index}]`, issues, true))
  }

  const role = record.role
  if (checkKeys(role, ["component_type", "bundle_candidate_for", "candidate_status"], new Set(["component_type", "bundle_candidate_for", "candidate_status"]), "role", issues)) {
    if (!COMPONENT_TYPES.has(role.component_type)) addIssue(issues, "role.component_type", "Unsupported component type.")
    if (typeof role.bundle_candidate_for !== "string" && role.bundle_candidate_for !== null) addIssue(issues, "role.bundle_candidate_for", "Bundle candidate must be a string or null.")
    if (!CANDIDATE_STATUSES.has(role.candidate_status)) addIssue(issues, "role.candidate_status", "Unsupported candidate status.")
  }

  const cost = record.cost
  if (checkKeys(cost, ["unit_cost", "currency", "moq", "batch_quantity", "batch_product_cost", "batch_shipping_cost", "landed_total", "landed_unit_cost"], new Set(["unit_cost", "currency", "moq", "batch_quantity", "batch_product_cost", "batch_shipping_cost", "landed_total", "landed_unit_cost"]), "cost", issues)) {
    checkMoney(cost.unit_cost, "cost.unit_cost", issues)
    checkQuantity(cost.moq, "cost.moq", issues)
    checkQuantity(cost.batch_quantity, "cost.batch_quantity", issues)
    for (const key of ["batch_product_cost", "batch_shipping_cost", "landed_total", "landed_unit_cost"]) checkMoney(cost[key], `cost.${key}`, issues)
    if (typeof cost.currency !== "string" || !["USD", "EUR", "UNKNOWN"].includes(cost.currency)) addIssue(issues, "cost.currency", "Unsupported currency.")
  }

  const physical = record.physical
  if (checkKeys(physical, ["product_dimensions", "product_weight", "material", "unit_packaging", "unit_package_dimensions", "unit_package_weight"], new Set(["product_dimensions", "product_weight", "material", "unit_packaging", "unit_package_dimensions", "unit_package_weight"]), "physical", issues)) {
    checkDimensions(physical.product_dimensions, "physical.product_dimensions", issues, true)
    checkMeasurement(physical.product_weight, "physical.product_weight", issues)
    checkFact(physical.material, "physical.material", issues)
    checkFact(physical.unit_packaging, "physical.unit_packaging", issues)
    checkDimensions(physical.unit_package_dimensions, "physical.unit_package_dimensions", issues, true)
    checkMeasurement(physical.unit_package_weight, "physical.unit_package_weight", issues)
  }

  const carton = record.carton
  if (checkKeys(carton, ["units_per_carton", "carton_dimensions", "carton_gross_weight", "hundred_units_estimate"], new Set(["units_per_carton", "carton_dimensions", "carton_gross_weight", "hundred_units_estimate"]), "carton", issues)) {
    checkQuantity(carton.units_per_carton, "carton.units_per_carton", issues)
    checkDimensions(carton.carton_dimensions, "carton.carton_dimensions", issues)
    checkMeasurement(carton.carton_gross_weight, "carton.carton_gross_weight", issues)
    if (checkKeys(carton.hundred_units_estimate, ["carton_count", "approximate_gross_weight", "source", "status"], new Set(["carton_count", "approximate_gross_weight", "source", "status"]), "carton.hundred_units_estimate", issues)) {
      checkQuantity(carton.hundred_units_estimate.carton_count, "carton.hundred_units_estimate.carton_count", issues)
      checkMeasurement(carton.hundred_units_estimate.approximate_gross_weight, "carton.hundred_units_estimate.approximate_gross_weight", issues)
      if (!["SUPPLIER_CLAIM", "SUPPLIED_FACT"].includes(carton.hundred_units_estimate.source)) addIssue(issues, "carton.hundred_units_estimate.source", "Unsupported estimate source.")
      if (!["NEEDS_VERIFICATION", "UNKNOWN"].includes(carton.hundred_units_estimate.status)) addIssue(issues, "carton.hundred_units_estimate.status", "Estimate cannot be marked verified.")
    }
  }

  const variants = record.variants
  if (checkKeys(variants, ["colorways", "supplier_variant_ids", "variant_price_differences"], new Set(["colorways", "supplier_variant_ids", "variant_price_differences"]), "variants", issues)) {
    if (!Array.isArray(variants.colorways)) addIssue(issues, "variants.colorways", "Colorways must be an array.")
    else variants.colorways.forEach((item, index) => checkFact(item, `variants.colorways[${index}]`, issues, true))
    checkFact(variants.supplier_variant_ids, "variants.supplier_variant_ids", issues)
    checkMoney(variants.variant_price_differences, "variants.variant_price_differences", issues)
  }

  const operations = record.supplier_operations
  if (checkKeys(operations, ["stock_status", "lead_time", "bulk_shipping_quote", "dropship_support", "fba_support", "labeling_support", "supplier_claims"], new Set(["stock_status", "lead_time", "bulk_shipping_quote", "dropship_support", "fba_support", "labeling_support", "supplier_claims"]), "supplier_operations", issues)) {
    for (const key of ["stock_status", "lead_time", "dropship_support", "fba_support", "labeling_support"]) checkFact(operations[key], `supplier_operations.${key}`, issues)
    checkBulkShippingQuote(operations.bulk_shipping_quote, "supplier_operations.bulk_shipping_quote", issues)
    if (!Array.isArray(operations.supplier_claims)) addIssue(issues, "supplier_operations.supplier_claims", "Supplier claims must be an array.")
    else operations.supplier_claims.forEach((item, index) => checkFact(item, `supplier_operations.supplier_claims[${index}]`, issues, true))
  }

  const crossBorder = record.cross_border
  if (checkKeys(crossBorder, ["shipping_mode", "ddp_terms", "transit_time", "supplier_hs_code", "hs_verification", "country_of_origin", "import_notes"], new Set(["shipping_mode", "ddp_terms", "transit_time", "supplier_hs_code", "hs_verification", "country_of_origin", "import_notes"]), "cross_border", issues)) {
    for (const key of ["shipping_mode", "ddp_terms", "transit_time", "supplier_hs_code", "country_of_origin", "import_notes"]) checkFact(crossBorder[key], `cross_border.${key}`, issues)
    if (!["VERIFIED", "NEEDS_VERIFICATION", "UNKNOWN"].includes(crossBorder.hs_verification)) addIssue(issues, "cross_border.hs_verification", "Unsupported HS verification status.")
  }

  const risk = record.risk
  if (checkKeys(risk, ["fto_status", "patent_claims", "compliance_status", "supplier_claims", "unresolved_risks"], new Set(["fto_status", "patent_claims", "compliance_status", "supplier_claims", "unresolved_risks"]), "risk", issues)) {
    for (const key of ["fto_status", "patent_claims", "compliance_status"]) checkFact(risk[key], `risk.${key}`, issues)
    for (const key of ["supplier_claims", "unresolved_risks"]) {
      if (!Array.isArray(risk[key])) addIssue(issues, `risk.${key}`, "Evidence list must be an array.")
      else risk[key].forEach((item, index) => checkFact(item, `risk.${key}[${index}]`, issues, true))
    }
  }

  const sample = record.sample
  if (checkKeys(sample, ["quantity", "sample_cost", "shipping_cost", "transit_time", "refund_condition", "test_status", "test_scope", "sampling_plan", "ab_competitor", "score", "hard_fail", "decision"], new Set(["quantity", "sample_cost", "shipping_cost", "transit_time", "refund_condition", "test_status", "test_scope", "sampling_plan", "ab_competitor", "score", "hard_fail", "decision"]), "sample", issues)) {
    checkQuantity(sample.quantity, "sample.quantity", issues)
    checkMoney(sample.sample_cost, "sample.sample_cost", issues)
    checkMoney(sample.shipping_cost, "sample.shipping_cost", issues)
    checkFact(sample.transit_time, "sample.transit_time", issues)
    checkFact(sample.refund_condition, "sample.refund_condition", issues)
    checkFact(sample.sampling_plan, "sample.sampling_plan", issues)
    checkFact(sample.ab_competitor, "sample.ab_competitor", issues)
    if (!["PENDING", "IN_PROGRESS", "PASS", "FAIL", "UNKNOWN"].includes(sample.test_status)) addIssue(issues, "sample.test_status", "Unsupported sample test status.")
    if (!Array.isArray(sample.test_scope) || sample.test_scope.some((item) => typeof item !== "string")) addIssue(issues, "sample.test_scope", "Test scope must be an array of strings.")
    if (sample.score !== "NOT_TESTED" && (typeof sample.score !== "number" || sample.score < 0 || sample.score > 100)) addIssue(issues, "sample.score", "Sample score must be NOT_TESTED or a number from 0 to 100.")
    if (!["NOT_TESTED", "YES", "NO"].includes(sample.hard_fail)) addIssue(issues, "sample.hard_fail", "Hard-fail status must be NOT_TESTED, YES or NO.")
    if (!["NOT_TESTED", "PASS", "FAIL", "RETEST_REQUIRED"].includes(sample.decision)) addIssue(issues, "sample.decision", "Sample decision is unsupported.")
  }

  const procurement = record.procurement
  if (checkKeys(procurement, ["status", "bulk_order_gate", "approval_reason", "rejection_reason"], new Set(["status", "bulk_order_gate", "approval_reason", "rejection_reason"]), "procurement", issues)) {
    if (!["CANDIDATE", "APPROVED", "REJECTED"].includes(procurement.status)) addIssue(issues, "procurement.status", "Unsupported procurement status.")
    if (!["HOLD", "OPEN", "BLOCKED"].includes(procurement.bulk_order_gate)) addIssue(issues, "procurement.bulk_order_gate", "Unsupported bulk order gate.")
    checkFact(procurement.approval_reason, "procurement.approval_reason", issues)
    checkFact(procurement.rejection_reason, "procurement.rejection_reason", issues)
  }
  if (record.metadata !== undefined && !isObject(record.metadata)) addIssue(issues, "metadata", "Metadata must be an object.")
  return issues
}

function sourceGate(record) {
  const identity = record.identity
  const supplierUrl = safeUrl(identity?.supplier_url)
  return Boolean(identity && !isUnknown(identity.component_id) && !isUnknown(identity.source_product_id) && supplierUrl && /^https?:$/.test(supplierUrl.protocol) && !isUnknown(identity.source_platform) && Array.isArray(identity.source_evidence) && identity.source_evidence.length > 0)
}

function allClaimItemsLabeled(record) {
  const lists = [record.supplier_operations?.supplier_claims, record.risk?.supplier_claims]
  return lists.every((list) => Array.isArray(list) && list.every((item) => item?.source === "SUPPLIER_CLAIM" && item.status !== "VERIFIED"))
}

function packageUnknown(record) {
  const dimensions = record.physical?.unit_package_dimensions
  return dimensions?.unit === "UNKNOWN" && [dimensions.width, dimensions.height, dimensions.depth].every((value) => value === null) && record.physical?.unit_package_weight?.value === null && record.physical?.unit_package_weight?.unit === "UNKNOWN"
}

function noInventedFields(record) {
  // Unknown is a valid state in this contract. The check is evidence-based:
  // only supplier-labelled claims and explicit verification states may drive
  // a conclusion; it must not require today's exact list of unknown fields.
  const hasSourceIdentity = sourceGate(record)
  const claimsAreSeparated = allClaimItemsLabeled(record)
  const verifiedFactHasEvidence = (fact) => fact?.value !== "VERIFIED" || (
    fact.status === "VERIFIED" &&
    typeof fact.evidence === "string" && fact.evidence.trim().length > 0 &&
    fact.source !== "UNKNOWN_SOURCE"
  )
  const riskFactsAreEvidenceBacked = verifiedFactHasEvidence(record.risk?.fto_status) && verifiedFactHasEvidence(record.risk?.compliance_status)
  const unresolvedLogisticsIsExplicit = record.cross_border?.hs_verification !== "VERIFIED" || record.cross_border?.country_of_origin?.value === null
  return hasSourceIdentity && claimsAreSeparated && riskFactsAreEvidenceBacked && unresolvedLogisticsIsExplicit
}

function safeUrl(value) {
  try { return new URL(value) } catch { return null }
}

function validateComponent(record) {
  const shapeIssues = validateComponentShape(record)
  if (shapeIssues.length > 0) {
    return { result: "BLOCKED", schema_valid: false, gates: Object.fromEntries(GATE_NAMES.map((name) => [name, "BLOCKED"])), issue_count: shapeIssues.length, issues: shapeIssues, checks: { MEDUSA_WRITE: "NO" } }
  }
  const issues = []
  const identityUrl = safeUrl(record.identity.supplier_url)
  const source = sourceGate(record) && identityUrl
  const contradictorySampleState = record.sample.test_status === "FAIL" && ["NOT_TESTED", "RETEST_REQUIRED"].includes(record.sample.decision)
  const sample = record.sample.hard_fail === "YES" || record.sample.decision === "FAIL" || contradictorySampleState
    ? "FAIL"
    : record.sample.decision === "PASS" && record.sample.hard_fail === "NO" && record.sample.test_status === "PASS"
      ? "PASS"
      : "NEEDS_TEST"
  const logistics = packageUnknown(record) || record.physical.product_dimensions.depth === null || record.cross_border.country_of_origin.value === null || record.cross_border.hs_verification !== "VERIFIED" ? "NEEDS_VERIFICATION" : "PASS"
  const risk = record.risk.fto_status.value !== "VERIFIED" || record.risk.compliance_status.value === "UNKNOWN" ? "NEEDS_VERIFICATION" : "PASS"
  if (!source) issues.push({ field: "identity", state: "INVALID", message: "Source identity or evidence is incomplete." })
  if (!allClaimItemsLabeled(record)) issues.push({ field: "supplier_claims", state: "INVALID", message: "Supplier claims must retain source SUPPLIER_CLAIM and cannot be marked VERIFIED." })
  const procurement = sample === "FAIL"
    ? "REJECT"
    : sample !== "PASS"
      ? "HOLD"
      : logistics === "PASS" && risk === "PASS" && record.procurement.bulk_order_gate === "OPEN"
        ? "READY_FOR_APPROVAL"
        : "HOLD"
  const gates = { SOURCE_GATE: source ? "PASS" : "BLOCKED", SAMPLE_GATE: sample, PROCUREMENT_GATE: procurement, LOGISTICS_GATE: logistics, RISK_GATE: risk }
  if (sample === "FAIL") issues.push({ field: "sample", state: "BLOCKED", message: "A hard-failed or failed sample blocks procurement." })
  if (contradictorySampleState) issues.push({ field: "sample", state: "BLOCKED", message: "A failed sample cannot remain NOT_TESTED or RETEST_REQUIRED; record an explicit FAIL decision." })
  const checks = {
    BUNDLE_ID: record.bundle_id === BUNDLE_ID ? "PASS" : "FAIL",
    NO_INVENTED_FIELDS: noInventedFields(record) ? "PASS" : "FAIL",
    SUPPLIER_CLAIMS_LABELED: allClaimItemsLabeled(record) ? "PASS" : "FAIL",
    BULK_SHIPPING_QUOTE_LABELED: record.supplier_operations.bulk_shipping_quote.source === "SUPPLIER_CLAIM" && record.supplier_operations.bulk_shipping_quote.status !== "VERIFIED" ? "PASS" : "FAIL",
    HS_NOT_VERIFIED: record.cross_border.supplier_hs_code.status !== "VERIFIED" && record.cross_border.hs_verification !== "VERIFIED" ? "PASS" : "FAIL",
    FTO_NOT_VERIFIED: record.risk.fto_status.value !== "VERIFIED" || (record.risk.fto_status.status === "VERIFIED" && typeof record.risk.fto_status.evidence === "string" && record.risk.fto_status.evidence.trim().length > 0) ? "PASS" : "FAIL",
    DROPSHIP_UNKNOWN: isUnknown(record.supplier_operations.dropship_support.value) ? "PASS" : "FAIL",
    UNIT_PACKAGE_UNKNOWN: packageUnknown(record) ? "PASS" : "FAIL",
    COST_CALCULATION: Math.abs(record.cost.batch_product_cost.value - (record.cost.unit_cost.value * record.cost.batch_quantity.value)) < 0.005 && Math.abs(record.cost.landed_total.value - (record.cost.batch_product_cost.value + record.cost.batch_shipping_cost.value)) < 0.005 && Math.abs(record.cost.landed_unit_cost.value - (record.cost.landed_total.value / record.cost.batch_quantity.value)) < 0.005 ? "PASS" : "FAIL",
    SAMPLE_SCORE: record.sample.score,
    HARD_FAIL: record.sample.hard_fail,
    QUOTE_RECONFIRMATION_REQUIRED: "YES",
    BULK_ORDER_GATE: procurement,
    MEDUSA_WRITE: "NO",
  }
  if (Object.values(checks).some((value) => value === "FAIL")) issues.push({ field: "checks", state: "INVALID", message: "One or more evidence-preservation checks failed." })
  const result = issues.length > 0 || Object.values(gates).includes("BLOCKED") ? "BLOCKED" : Object.values(gates).some((value) => !["PASS", "OPEN"].includes(value)) ? "NEEDS_VERIFICATION" : "PASS"
  return { result, schema_valid: true, gates, checks, issue_count: issues.length, issues }
}

function validateBomShape(record) {
  const issues = []
  const required = ["schema_version", "record_type", "bom_id", "bundle_id", "bundle_candidate_for", "status", "components", "packaging_components", "costing", "notes"]
  if (!isObject(record)) { addIssue(issues, "root", "BOM root must be an object."); return issues }
  checkKeys(record, required, new Set([...required, "sellable_product_id"]), "root", issues)
  if (record.schema_version !== "1.0.0" || record.record_type !== "BUNDLE_BOM") addIssue(issues, "schema", "Unsupported BOM schema or record type.")
  if (typeof record.bundle_id !== "string" || record.bundle_id.length === 0) addIssue(issues, "bundle_id", "BOM needs a stable non-empty bundle ID.")
  if (!Array.isArray(record.components) || record.components.length === 0) addIssue(issues, "components", "At least one BOM component is required.")
  else record.components.forEach((item, index) => {
    const field = `components[${index}]`
    if (!isObject(item)) { addIssue(issues, field, "Component line must be an object."); return }
    checkKeys(item, ["component_id", "quantity", "role", "component_status"], new Set(["component_id", "quantity", "role", "component_status", "unit_cost", "landed_unit_cost", "currency"]), field, issues)
    if (typeof item.component_id !== "string" || typeof item.quantity !== "number" || item.quantity <= 0) addIssue(issues, field, "Component line needs a positive quantity and ID.")
  })
  if (!Array.isArray(record.packaging_components)) addIssue(issues, "packaging_components", "Packaging components must be an array.")
  if (!isObject(record.costing)) addIssue(issues, "costing", "Costing must be an object.")
  if (!Array.isArray(record.notes)) addIssue(issues, "notes", "Notes must be an array.")
  return issues
}

function validateBom(record) {
  const issues = validateBomShape(record)
  if (issues.length > 0) return { result: "BLOCKED", schema_valid: false, issue_count: issues.length, issues }
  const onlyComp001 = record.components.length === 1 && record.components[0].component_id === "COMP-001" && record.components[0].quantity === 1
  const draftOnly = record.status === "DRAFT" && record.sellable_product_id === null && record.packaging_components.length === 0 && record.costing.bundle_cogs === null
  const bundleIdStable = record.bundle_id === BUNDLE_ID
  const line = record.components[0]
  const costCalculation = Math.abs(record.costing.component_cost - (line.unit_cost * line.quantity)) < 0.005 && Math.abs(record.costing.landed_component_cost - (line.landed_unit_cost * line.quantity)) < 0.005
  const valid = onlyComp001 && draftOnly && costCalculation && bundleIdStable
  return { result: valid ? "PASS" : "BLOCKED", schema_valid: true, bundle_id: record.bundle_id, bundle_id_stable: bundleIdStable ? "PASS" : "FAIL", component_reference: onlyComp001 ? "PASS" : "FAIL", final_kit_bom: draftOnly ? "NOT_CREATED" : "FAIL", cost_calculation: costCalculation ? "PASS" : "FAIL", issue_count: valid ? 0 : 1, issues: valid ? [] : [{ field: "BOM", message: "Draft BOM must contain only COMP-001, use the stable bundle ID, calculate supplied costs and make no final Kit claims." }] }
}

function printValidation(validation, asJson) {
  if (asJson) { console.log(JSON.stringify(validation, null, 2)); return }
  console.log(`COMPONENT_RECORD=${validation.result}`)
  if (validation.gates) for (const [key, value] of Object.entries(validation.gates)) console.log(`${key}=${value}`)
  if (validation.checks) for (const [key, value] of Object.entries(validation.checks)) console.log(`${key}=${value}`)
  console.log(`SCHEMA_VALID=${validation.schema_valid ? "PASS" : "FAIL"}`)
  console.log(`ISSUE_COUNT=${validation.issue_count}`)
  for (const entry of validation.issues) console.log(`${entry.field}|${entry.message}`)
}

function runTests(options) {
  const record = readJson(options.input)
  const validation = validateComponent(record)
  const bomPath = path.resolve(path.dirname(options.input), "..", "bom", "PET-FUR-RESCUE-KIT.draft.json")
  const bom = validateBom(readJson(bomPath))
  const cases = [
    ["COMPONENT_RECORD_NEEDS_VERIFICATION", validation.result === "NEEDS_VERIFICATION"],
    ["SOURCE_GATE_PASS", validation.gates.SOURCE_GATE === "PASS"],
    ["SAMPLE_GATE_NEEDS_TEST", validation.gates.SAMPLE_GATE === "NEEDS_TEST"],
    ["PROCUREMENT_GATE_HOLD", validation.gates.PROCUREMENT_GATE === "HOLD"],
    ["LOGISTICS_GATE_NEEDS_VERIFICATION", validation.gates.LOGISTICS_GATE === "NEEDS_VERIFICATION"],
    ["RISK_GATE_NEEDS_VERIFICATION", validation.gates.RISK_GATE === "NEEDS_VERIFICATION"],
    ["BUNDLE_ID_STABLE", validation.checks.BUNDLE_ID === "PASS"],
    ["NO_INVENTED_FIELDS_PASS", validation.checks.NO_INVENTED_FIELDS === "PASS"],
    ["SUPPLIER_CLAIMS_LABELED_PASS", validation.checks.SUPPLIER_CLAIMS_LABELED === "PASS"],
    ["BULK_SHIPPING_QUOTE_LABELED_PASS", validation.checks.BULK_SHIPPING_QUOTE_LABELED === "PASS"],
    ["HS_NOT_VERIFIED_PASS", validation.checks.HS_NOT_VERIFIED === "PASS"],
    ["FTO_NOT_VERIFIED_PASS", validation.checks.FTO_NOT_VERIFIED === "PASS"],
    ["DROPSHIP_UNKNOWN_PASS", validation.checks.DROPSHIP_UNKNOWN === "PASS"],
    ["UNIT_PACKAGE_UNKNOWN_PASS", validation.checks.UNIT_PACKAGE_UNKNOWN === "PASS"],
    ["COST_CALCULATION_PASS", validation.checks.COST_CALCULATION === "PASS"],
    ["BULK_ORDER_HOLD", validation.checks.BULK_ORDER_GATE === "HOLD"],
    ["MEDUSA_WRITE_NO", validation.checks.MEDUSA_WRITE === "NO"],
    ["SAMPLE_SCORE_NOT_TESTED", validation.checks.SAMPLE_SCORE === "NOT_TESTED"],
    ["HARD_FAIL_NOT_TESTED", validation.checks.HARD_FAIL === "NOT_TESTED"],
    ["QUOTE_RECONFIRMATION_REQUIRED_YES", validation.checks.QUOTE_RECONFIRMATION_REQUIRED === "YES"],
    ["DRAFT_BOM_PASS", bom.result === "PASS" && bom.bundle_id_stable === "PASS"],
    ["HARD_FAIL_BLOCKS_PROCUREMENT", (() => { const candidate = JSON.parse(JSON.stringify(record)); candidate.sample.hard_fail = "YES"; candidate.sample.decision = "PASS"; candidate.procurement.bulk_order_gate = "OPEN"; const result = validateComponent(candidate); return result.result === "BLOCKED" && result.gates.SAMPLE_GATE === "FAIL" && result.gates.PROCUREMENT_GATE === "REJECT" })()],
    ["FAILED_SAMPLE_REJECTS", (() => { const candidate = JSON.parse(JSON.stringify(record)); candidate.sample.hard_fail = "NO"; candidate.sample.decision = "FAIL"; candidate.sample.test_status = "PASS"; candidate.procurement.bulk_order_gate = "OPEN"; const result = validateComponent(candidate); return result.result === "BLOCKED" && result.gates.PROCUREMENT_GATE === "REJECT" })()],
    ["FAILED_SAMPLE_CONTRADICTION_BLOCKS", (() => { const candidate = JSON.parse(JSON.stringify(record)); candidate.sample.hard_fail = "NO"; candidate.sample.decision = "NOT_TESTED"; candidate.sample.test_status = "FAIL"; const result = validateComponent(candidate); return result.result === "BLOCKED" && result.gates.SAMPLE_GATE === "FAIL" && result.gates.PROCUREMENT_GATE === "REJECT" })()],
    ["VERIFIED_FACT_WITH_EVIDENCE_ALLOWED", (() => { const candidate = JSON.parse(JSON.stringify(record)); candidate.risk.fto_status = { value: "VERIFIED", source: "PROJECT_DECISION", status: "VERIFIED", evidence: "Independent review record" }; const result = validateComponent(candidate); return result.checks.NO_INVENTED_FIELDS === "PASS" })()],
    ["OPEN_INPUT_CANNOT_OVERRIDE_UNVERIFIED", (() => { const candidate = JSON.parse(JSON.stringify(record)); candidate.sample.hard_fail = "NO"; candidate.sample.decision = "PASS"; candidate.sample.test_status = "PASS"; candidate.procurement.bulk_order_gate = "OPEN"; const result = validateComponent(candidate); return result.gates.PROCUREMENT_GATE === "HOLD" })()],
  ]
  for (const [name, passed] of cases) console.log(`CASE_${name}=${passed ? "PASS" : "FAIL"}`)
  const passed = cases.every(([, value]) => value)
  console.log(`COMPONENT_VALIDATION_TESTS=${passed ? "PASS" : "FAIL"}`)
  return passed ? 0 : 2
}

function printHelp() {
  console.log(`Usage:\n  node 05_product/sourcing/scripts/component-pipeline.mjs validate --input <component.json> [--json]\n  node 05_product/sourcing/scripts/component-pipeline.mjs validate-bom --input <bom.json> [--json]\n  node 05_product/sourcing/scripts/component-pipeline.mjs test --input <component.json>`)
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.mode === "help" || options.mode === "--help") { printHelp(); process.exit(0) }
  if (options.mode === "test") process.exitCode = runTests(options)
  else if (options.mode === "validate") { const validation = validateComponent(readJson(options.input)); printValidation(validation, options.json); process.exitCode = validation.result === "BLOCKED" ? 2 : 0 }
  else if (options.mode === "validate-bom") { const validation = validateBom(readJson(options.input)); if (options.json) console.log(JSON.stringify(validation, null, 2)); else { console.log(`BOM_RECORD=${validation.result}`); console.log(`BUNDLE_ID=${validation.bundle_id || "NOT_EVALUATED"}`); console.log(`BUNDLE_ID_STABLE=${validation.bundle_id_stable || "NOT_EVALUATED"}`); console.log(`COMPONENT_REFERENCE=${validation.component_reference || "NOT_EVALUATED"}`); console.log(`FINAL_KIT_BOM=${validation.final_kit_bom || "NOT_EVALUATED"}`); console.log(`COST_CALCULATION=${validation.cost_calculation || "NOT_EVALUATED"}`); console.log(`ISSUE_COUNT=${validation.issue_count}`) }; process.exitCode = validation.result === "BLOCKED" ? 2 : 0 }
  else throw new Error(`Unknown mode: ${options.mode}`)
} catch (error) {
  console.error(`ERROR=${error.message}`)
  process.exitCode = 1
}
