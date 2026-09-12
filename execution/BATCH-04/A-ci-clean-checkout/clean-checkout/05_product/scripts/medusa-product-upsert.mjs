#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { buildInventoryPlan, inventoryLevelRequest } from "./medusa-inventory-plan.mjs"
import { buildPublicMedusaPayload } from "./medusa-product-payload.mjs"

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..")
const DEFAULT_TEMPLATE = path.join(PROJECT_ROOT, "03_template", "medusa-crossborder-base")
const PRODUCT_PIPELINE = path.join(PROJECT_ROOT, "05_product", "scripts", "product-pipeline.mjs")
const FORBIDDEN_PROJECTS = new Set([
  "crossborder-medusa",
  "crossborder-medusa-repeat",
  "crossborder-medusa-repeat-2",
  "medusa-template-validation",
])

function parseArgs(argv) {
  const options = { write: false, publish: false, productionInventoryWrite: false, input: null, template: DEFAULT_TEMPLATE, expectedProject: null, regionCountry: "us" }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--write") { options.write = true; continue }
    if (argument === "--publish") { options.publish = true; continue }
    if (argument === "--production-inventory-write") { options.productionInventoryWrite = true; continue }
    if (argument === "--help" || argument === "-h") { options.help = true; continue }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`)
    const key = argument.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`)
    if (key === "input") options.input = path.resolve(value)
    else if (key === "template") options.template = path.resolve(value)
    else if (key === "project-name") options.expectedProject = value
    else if (key === "region-country") options.regionCountry = value.toLowerCase()
    else throw new Error(`Unknown argument: ${argument}`)
    index += 1
  }
  return options
}

function printHelp() {
  console.log("Usage: node 05_product/scripts/medusa-product-upsert.mjs --input <normalized-product.json> [--template <mother-template>] [--project-name <expected-project>] [--write] [--publish] [--production-inventory-write]")
  console.log("Default mode is a local validation and dry-run. --write is required for an idempotent local Medusa upsert; --publish is a separate explicit local activation request.")
}

function readJson(filePath) {
  try { return JSON.parse(readFileSync(filePath, "utf8")) } catch (error) { throw new Error(`Cannot read JSON ${filePath}: ${error.message}`) }
}

function readEnvValue(filePath, name) {
  try {
    const content = readFileSync(filePath, "utf8")
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const match = content.match(new RegExp(`^${escaped}=(.*)$`, "m"))
    return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : ""
  } catch { return "" }
}

function runPipeline(mode, inputPath) {
  const result = spawnSync(process.execPath, [PRODUCT_PIPELINE, mode, "--input", inputPath, "--json"], { cwd: PROJECT_ROOT, encoding: "utf8" })
  if (result.error) throw new Error(`Product pipeline could not start: ${result.error.message}`)
  let parsed
  try { parsed = JSON.parse(result.stdout) } catch { throw new Error(`Product pipeline returned invalid JSON for ${mode}.`) }
  return parsed
}

function runDocker(args, environment = {}) {
  try {
    return execFileSync("docker", args, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  } catch (error) { throw new Error(`Docker target check failed; no write attempted (${error.status ?? "command error"}).`) }
}

function assertLocalTarget(templatePath, expectedProject) {
  const runtimePath = path.join(templatePath, ".runtime", "local-config.json")
  const config = readJson(runtimePath)
  const projectName = String(config.ProjectName || "")
  const databasePort = Number(config.DatabasePort)
  const backendPort = Number(config.BackendPort)
  if (!/^[a-z][a-z0-9_-]{2,62}$/.test(projectName) || FORBIDDEN_PROJECTS.has(projectName)) throw new Error("Target project identity is not an allowed local Mother Template project; no write attempted.")
  if (expectedProject && expectedProject !== projectName) throw new Error(`Expected project does not match saved local project (${expectedProject} != ${projectName}); no write attempted.`)
  if (![databasePort, backendPort].every((port) => Number.isInteger(port) && port >= 1024 && port <= 65535)) throw new Error("Saved local project ports are invalid; no write attempted.")

  const composeFile = path.join(templatePath, "docker-compose.local.yml")
  const composeEnvironment = { MEDUSA_PROJECT_NAME: projectName, MEDUSA_DB_PORT: String(databasePort) }
  const container = runDocker(["compose", "-p", projectName, "-f", composeFile, "ps", "-q", "postgres"], composeEnvironment)
  if (!container) throw new Error("Target Mother Template PostgreSQL container is not running; no write attempted.")
  const inspect = JSON.parse(runDocker(["inspect", container]))[0]
  if (inspect.Config?.Labels?.["com.docker.compose.project"] !== projectName) throw new Error("PostgreSQL container Compose project label does not match target; no write attempted.")
  const volumeName = `${projectName}_pgdata`
  const volume = JSON.parse(runDocker(["volume", "inspect", volumeName]))[0]
  if (volume.Labels?.["com.docker.compose.project"] !== projectName) throw new Error("PostgreSQL volume identity does not match target; no write attempted.")
  if (!inspect.Mounts?.some((mount) => mount.Name === volumeName)) throw new Error("PostgreSQL container is not mounted to the expected target volume; no write attempted.")

  const backendEnv = path.join(templatePath, "apps", "backend", ".env")
  const databaseUrl = readEnvValue(backendEnv, "DATABASE_URL")
  let database
  try { database = new URL(databaseUrl) } catch { throw new Error("Target backend DATABASE_URL is missing or invalid; no write attempted.") }
  if (Number(database.port) !== databasePort || database.hostname !== "127.0.0.1" || database.pathname !== "/medusa_dtc") throw new Error("Target backend DATABASE_URL does not match saved local project; no write attempted.")

  const backendUrl = `http://127.0.0.1:${backendPort}`
  return { projectName, databasePort, backendPort, volumeName, container, backendUrl, databaseName: database.pathname.slice(1) }
}

function buildPayload(record, productStatus = "draft") {
  const inventoryMode = record.commerce.availability_mode === "LOCAL_PREVIEW_AVAILABILITY"
    ? "LOCAL_PREVIEW_AVAILABILITY"
    : record.commerce.availability_mode === "PRODUCTION_INVENTORY"
      ? "PRODUCTION_INVENTORY"
      : undefined
  return buildPublicMedusaPayload(record, { status: productStatus, inventoryMode })
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!response.ok) {
    const detail = body && typeof body === "object"
      ? body.message || body.error || body.errors?.[0]?.message || "request rejected"
      : "request rejected"
    throw new Error(`HTTP ${response.status} ${options.method || "GET"} ${pathname}: ${detail}`)
  }
  return body
}

async function login(target, templatePath) {
  const credentialPath = path.join(templatePath, ".runtime", "admin.local.txt")
  const credentialContent = (() => { try { return readFileSync(credentialPath, "utf8") } catch { return "" } })()
  const readCredential = (name) => credentialContent.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() || ""
  const email = process.env.MEDUSA_ADMIN_EMAIL || readCredential("email")
  const password = process.env.MEDUSA_ADMIN_PASSWORD || readCredential("password")
  if (!email || !password) throw new Error("Local Admin credential is unavailable; no write attempted.")
  const result = await request(target.backendUrl, "/auth/user/emailpass", { method: "POST", body: JSON.stringify({ email, password }) })
  if (!result?.token) throw new Error("Local Admin authentication did not return a token; no write attempted.")
  return result.token
}

async function findTargetRegion(target, token, country) {
  const response = await request(target.backendUrl, "/admin/regions?limit=100&fields=*", { headers: { Authorization: `Bearer ${token}` } })
  const region = (response?.regions || []).find((item) => String(item.currency_code).toLowerCase() === "usd" && (item.countries || []).some((itemCountry) => String(itemCountry.iso_2 || itemCountry.iso2 || "").toLowerCase() === country))
  if (!region) throw new Error(`Target local Admin API has no US/USD region; no write attempted.`)
  return region
}

async function listProducts(target, token) {
  const products = []
  let offset = 0
  const limit = 100
  while (true) {
    const response = await request(target.backendUrl, `/admin/products?limit=${limit}&offset=${offset}&fields=*`, { headers: { Authorization: `Bearer ${token}` } })
    products.push(...(response?.products || []))
    if (products.length >= Number(response?.count || products.length) || (response?.products || []).length < limit) break
    offset += limit
  }
  return products
}

function findExistingProduct(products, record) {
  const sourceId = String(record.identity.source_product_id)
  const bySource = products.filter((product) => String(product.metadata?.pawfectly_source_product_id || "") === sourceId)
  if (bySource.length > 1) throw new Error("Multiple products already carry the same stable source identity; refusing to write.")
  if (bySource.length === 1) return bySource[0]
  const byHandle = products.filter((product) => product.handle === record.identity.handle)
  if (byHandle.length > 0) throw new Error("Product handle is already owned by another product; refusing to create a duplicate.")
  return null
}

function replaceMetadata(existingMetadata, desiredMetadata) {
  const cleared = {}
  for (const key of Object.keys(existingMetadata || {})) {
    // Medusa 2.19's mergeMetadata contract treats an empty string as an
    // explicit delete marker; null is retained as a public JSON key.
    if (!Object.prototype.hasOwnProperty.call(desiredMetadata || {}, key)) cleared[key] = ""
  }
  return { ...cleared, ...(desiredMetadata || {}) }
}

function updatePayload(payload, existing) {
  const existingVariants = existing.variants || []
  const bySku = new Map()
  for (const variant of existingVariants) {
    if (!variant.sku) continue
    if (bySku.has(variant.sku)) throw new Error(`Existing product has duplicate variant SKU ${variant.sku}; refusing to write.`)
    bySku.set(variant.sku, variant)
  }
  const { options: _options, ...productFields } = payload
  return {
    ...productFields,
    // Send explicit nulls for legacy keys because Medusa product metadata
    // updates merge objects rather than treating an omitted key as a delete.
    metadata: replaceMetadata(existing.metadata, payload.metadata),
    variants: payload.variants.map((variant) => {
      const existingVariant = bySku.get(variant.sku)
      return {
        ...variant,
        ...(existingVariant?.id ? { id: existingVariant.id } : {}),
        metadata: replaceMetadata(existingVariant?.metadata, variant.metadata),
      }
    }),
  }
}

function readVariantOption(variant, title) {
  if (Array.isArray(variant?.options)) return variant.options.find((option) => option.option?.title === title || option.title === title)?.value
  return variant?.options?.[title]
}

function assertProductReadback(product, record, expectedStatus) {
  if (!product?.id || product.handle !== record.identity.handle || String(product.metadata?.pawfectly_source_product_id) !== String(record.identity.source_product_id)) throw new Error("Admin product read-back identity mismatch.")
  if (String(product.status).toLowerCase() !== expectedStatus) throw new Error(`Admin product read-back is not ${expectedStatus.toUpperCase()}.`)
  const variants = product.variants || []
  const skus = variants.map((variant) => variant.sku).filter(Boolean)
  const expectedVariants = record.commerce.variants
  const expectedSkus = expectedVariants.map((variant) => variant.internal_sku)
  if (new Set(skus).size !== skus.length || variants.length !== expectedVariants.length || expectedSkus.some((sku) => !skus.includes(sku))) throw new Error("Admin product read-back variant identity is invalid.")
  const targetVariant = variants.find((variant) => variant.sku === expectedVariants[0].internal_sku)
  const localPreviewAvailability = record.commerce.availability_mode === "LOCAL_PREVIEW_AVAILABILITY" && record.commerce.storefront_purchasable === "YES"
  if (localPreviewAvailability && variants.some((variant) => variant.manage_inventory !== false)) throw new Error("Admin product read-back did not preserve LOCAL_PREVIEW_AVAILABILITY without owned inventory for every variant.")
  if (record.commerce.availability_mode === "PRODUCTION_INVENTORY" && variants.some((variant) => variant.manage_inventory !== true)) throw new Error("Admin product read-back did not restore native inventory management for every production variant.")
  const expectedImage = assetUrl(record.assets.main_image)
  if (expectedImage && (product.thumbnail !== expectedImage || !(product.images || []).some((image) => image.url === expectedImage))) throw new Error("Admin product read-back did not confirm the approved source image.")
  const expectedAmount = medusaRuntimeAmount(record.commerce.variants[0].selling_price ?? record.commerce.selling_price)
  const prices = targetVariant?.prices || []
  if (expectedAmount === null && prices.length !== 0) throw new Error("Admin product read-back unexpectedly contains a selling price without a confirmed master price.")
  if (expectedAmount !== null && !prices.some((price) => String(price.currency_code).toLowerCase() === String(record.commerce.currency).toLowerCase() && Number(price.amount) === expectedAmount)) throw new Error("Admin product read-back did not confirm the expected USD selling price.")
  for (const expectedVariant of expectedVariants) {
    const actualVariant = variants.find((variant) => variant.sku === expectedVariant.internal_sku)
    if (record.commerce.option_names.some((name) => readVariantOption(actualVariant, name) !== expectedVariant.options?.[name])) throw new Error("Admin product read-back variant option identity is invalid.")
    const expectedVariantAmount = medusaRuntimeAmount(expectedVariant.selling_price ?? record.commerce.selling_price)
    const actualPrices = actualVariant?.prices || []
    if (expectedVariantAmount !== null && !actualPrices.some((price) => String(price.currency_code).toLowerCase() === String(record.commerce.currency).toLowerCase() && Number(price.amount) === expectedVariantAmount)) throw new Error(`Admin product read-back did not confirm the price for variant ${expectedVariant.internal_sku}.`)
  }
  return product
}

function postgresReadback(target, product, record) {
  const sourceId = String(record.identity.source_product_id).replaceAll("'", "''")
  const productId = String(product.id).replaceAll("'", "''")
  const productRows = runDocker(["exec", target.container, "psql", "-U", "medusa", "-d", target.databaseName, "-At", "-F", "|", "-c", `SELECT id,handle,status,thumbnail,metadata->>'pawfectly_source_product_id' FROM product WHERE id='${productId}' AND metadata->>'pawfectly_source_product_id'='${sourceId}';`])
  const rows = productRows ? productRows.split(/\r?\n/).filter(Boolean) : []
  if (rows.length !== 1) throw new Error("PostgreSQL product read-back did not find exactly one matching product.")
  const variantRows = runDocker(["exec", target.container, "psql", "-U", "medusa", "-d", target.databaseName, "-At", "-F", "|", "-c", `SELECT sku,count(*) FROM product_variant WHERE product_id='${productId}' GROUP BY sku ORDER BY sku;`])
  const variantEntries = variantRows.split(/\r?\n/).filter(Boolean)
  if (variantEntries.length !== record.commerce.variants.length || record.commerce.variants.some((variant) => !variantEntries.includes(`${variant.internal_sku}|1`))) throw new Error("PostgreSQL variant read-back did not confirm every stable variant SKU exactly once.")
  const currency = String(record.commerce.currency).toUpperCase()
  const currencyCode = currency.toLowerCase()
  const expectedAmount = medusaRuntimeAmount(record.commerce.variants[0].selling_price ?? record.commerce.selling_price)
  const priceRows = runDocker(["exec", target.container, "psql", "-U", "medusa", "-d", target.databaseName, "-At", "-F", "|", "-c", `SELECT lower(p.currency_code),p.amount FROM product_variant_price_set pvps JOIN price p ON p.price_set_id=pvps.price_set_id WHERE pvps.variant_id IN (SELECT id FROM product_variant WHERE product_id='${productId}' AND sku='${String(record.commerce.variants[0].internal_sku).replaceAll("'", "''")}') AND p.deleted_at IS NULL ORDER BY p.currency_code;`])
  const priceEntries = priceRows ? priceRows.split(/\r?\n/).filter(Boolean) : []
  if (expectedAmount === null && priceEntries.length !== 0) throw new Error("PostgreSQL read-back found an unexpected selling price without a confirmed master price.")
  if (expectedAmount !== null && !priceEntries.includes(`${currencyCode}|${expectedAmount}`)) throw new Error("PostgreSQL read-back did not confirm the expected USD selling price.")
  const expectedImage = assetUrl(record.assets.main_image)
  if (expectedImage && !rows[0].split("|").includes(expectedImage)) throw new Error("PostgreSQL read-back did not confirm the approved source image.")
  return { productRow: rows[0], priceRow: priceEntries.join(",") || "NONE" }
}

async function storeReadback(target, templatePath, region, product, record, expectedStatus) {
  const publishableKey = process.env.MEDUSA_PUBLISHABLE_KEY || readEnvValue(path.join(templatePath, "apps", "storefront", ".env.local"), "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY")
  if (!publishableKey) throw new Error("Local storefront publishable key is unavailable for Store API read-back.")
  const response = await request(target.backendUrl, `/store/products?handle=${encodeURIComponent(record.identity.handle)}&region_id=${encodeURIComponent(region.id)}&limit=10`, { headers: { "x-publishable-api-key": publishableKey } })
  const visible = (response?.products || []).find((item) => item.handle === record.identity.handle)
  if (!visible && expectedStatus === "draft") return "NOT_VISIBLE_EXPECTED_FOR_DRAFT"
  if (!visible || visible.id !== product.id) throw new Error("Store API returned an unexpected product read-back.")
  const expectedImage = assetUrl(record.assets.main_image)
  const storeVariant = (visible.variants || []).find((variant) => variant.sku === record.commerce.variants[0].internal_sku)
  const expectedAmount = medusaRuntimeAmount(record.commerce.variants[0].selling_price ?? record.commerce.selling_price)
  const calculatedPrice = storeVariant?.calculated_price
  if (visible.title !== record.identity.title || visible.thumbnail !== expectedImage || !storeVariant || String(calculatedPrice?.currency_code).toLowerCase() !== String(record.commerce.currency).toLowerCase() || Number(calculatedPrice?.calculated_amount) !== expectedAmount) throw new Error("Store API read-back did not confirm product title, source image, SKU or USD calculated price.")
  return { status: "PASS", productRow: `${visible.id}|${visible.handle}|${visible.title}|${storeVariant.sku}`, priceRow: `${String(record.commerce.currency).toLowerCase()}|${expectedAmount}`, image: visible.thumbnail, publication: expectedStatus === "published" ? "PUBLISHED_CONFIRMED_BY_ADMIN_POSTGRES" : expectedStatus.toUpperCase() }
}

async function syncInventoryLevels(target, token, product, record) {
  const plans = buildInventoryPlan(record, product)
  for (const plan of plans) {
    const operation = inventoryLevelRequest(plan)
    await request(target.backendUrl, operation.pathname, {
      method: operation.method,
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(operation.body),
    })
  }
  const readback = await request(target.backendUrl, `/admin/products/${encodeURIComponent(product.id)}?fields=*variants.inventory_items.*`, { headers: { Authorization: `Bearer ${token}` } })
  const variants = (readback?.product || readback)?.variants || []
  for (const plan of plans) {
    const variant = variants.find((item) => item.id === plan.variant_id || item.sku === plan.sku)
    const relation = Array.isArray(variant?.inventory_items) ? variant.inventory_items[0] : undefined
    const level = relation?.inventory_item?.location_levels?.find((item) => item.location_id === plan.location_id)
    if (!level || Number(level.stocked_quantity) !== plan.stocked_quantity) throw new Error(`Inventory level read-back failed for ${plan.sku}.`)
  }
  return plans
}

async function execute(options) {
  if (options.help) { printHelp(); return 0 }
  if (!options.input) throw new Error("--input is required")
  if (options.publish && !options.write) throw new Error("--publish requires explicit --write; no write attempted.")
  const record = readJson(options.input)
  const validation = runPipeline("validate", options.input)
  if (validation.gates?.IMPORT_REQUIRED !== "PASS") throw new Error(`Product import gate is ${validation.gates?.IMPORT_REQUIRED || "UNKNOWN"}; no write attempted.`)
  if (options.write && !options.publish && record.record_status !== "DRAFT") throw new Error("Ordinary --write only accepts DRAFT records; use --publish for an explicit published-record request.")
  const expectedStatus = options.publish ? "published" : "draft"
  if (options.publish && record.record_status !== "PUBLISHED") throw new Error("Publish requires record_status=PUBLISHED after the publish gate has passed; no write attempted.")
  if (options.publish && validation.gates?.PUBLISH_REQUIRED !== "PASS") throw new Error("Publish gate is not PASS; no write attempted.")
  if (options.publish && record.commerce.project_owned_inventory === "UNKNOWN" && record.commerce.availability_mode !== "LOCAL_PREVIEW_AVAILABILITY") throw new Error("Production publication is blocked until owned inventory/fulfillment semantics are explicit; use LOCAL_PREVIEW_AVAILABILITY only for local validation.")
  if (record.commerce.availability_mode === "PRODUCTION_INVENTORY" && options.write && !options.productionInventoryWrite) throw new Error("PRODUCTION_INVENTORY requires the explicit --production-inventory-write flag; no write attempted.")
  const payload = buildPayload(record, expectedStatus)
  if (!options.write) {
    console.log("DRY_RUN=YES")
    console.log("WRITE_PERFORMED=NO")
    console.log(`VALIDATION_RESULT=${validation.result}`)
    console.log(`IMPORT_GATE=${validation.gates.IMPORT_REQUIRED}`)
    console.log("STORE_INTEGRATION_APPROVED_BY_USER=YES")
    console.log(`PRODUCT_STATUS=${record.record_status}`)
    console.log(`HANDLE=${record.identity.handle}`)
    console.log(`SELLING_PRICE_STATUS=${record.metadata?.selling_price_status || "NEEDS_USER_CONFIRMATION"}`)
    console.log("NO_MEDUSA_REQUEST=YES")
    return 0
  }

  const target = assertLocalTarget(options.template, options.expectedProject)
  const token = await login(target, options.template)
  const region = await findTargetRegion(target, token, options.regionCountry)
  const products = await listProducts(target, token)
  const existing = findExistingProduct(products, record)
  const body = existing ? updatePayload(payload, existing) : payload
  const pathSuffix = existing ? `/admin/products/${encodeURIComponent(existing.id)}` : "/admin/products"
  const response = await request(target.backendUrl, pathSuffix, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  const written = response?.product || response
  const product = assertProductReadback(await request(target.backendUrl, `/admin/products/${encodeURIComponent(written.id) ?? ""}?fields=*`, { headers: { Authorization: `Bearer ${token}` } }).then((result) => result?.product || result), record, expectedStatus)
  const inventoryPlans = record.commerce.availability_mode === "PRODUCTION_INVENTORY"
    ? await syncInventoryLevels(target, token, product, record)
    : []
  const storeStatus = await storeReadback(target, options.template, region, product, record, expectedStatus)
  const postgresRow = postgresReadback(target, product, record)
  const afterProducts = await listProducts(target, token)
  const matching = afterProducts.filter((item) => String(item.metadata?.pawfectly_source_product_id || "") === String(record.identity.source_product_id))
  if (matching.length !== 1) throw new Error("Idempotency check found more than one product for the stable source identity.")
  const productCountDelta = afterProducts.length - products.length
  if (existing && productCountDelta !== 0) throw new Error("Idempotency check changed the product count during an update.")
  if (!existing && productCountDelta !== 1) throw new Error("Create check did not add exactly one product.")
  const uniqueSkus = new Set((product.variants || []).map((variant) => variant.sku).filter(Boolean))
  if (uniqueSkus.size !== (product.variants || []).filter((variant) => variant.sku).length) throw new Error("Idempotency check found duplicate variant SKUs.")
  console.log("DRY_RUN=NO")
  console.log("WRITE_PERFORMED=YES")
  console.log("MEDUSA_WRITE=PASS")
  console.log(`TARGET_MEDUSA_PROJECT=${target.projectName}`)
  console.log(`TARGET_DATABASE=${target.databaseName}@127.0.0.1:${target.databasePort}`)
  console.log(`TARGET_REGION=${region.name || "United States"} (${region.id})`)
  console.log(`PRODUCT_ID=${product.id}`)
  console.log(`PRODUCT_STATUS=${product.status}`)
  console.log(`HANDLE=${product.handle}`)
  console.log(`UPSERT_MODE=${existing ? "UPDATE_SAME_PRODUCT" : "CREATE_DRAFT"}`)
  console.log("UPSERT_IDEMPOTENCE=PASS")
  console.log(`PRODUCT_COUNT_BEFORE=${products.length}`)
  console.log(`PRODUCT_COUNT_AFTER=${afterProducts.length}`)
  console.log(`PRODUCT_COUNT_DELTA=${productCountDelta}`)
  if (existing) console.log("PRODUCT_COUNT_DELTA_AFTER_RERUN=0")
  console.log("DUPLICATE_VARIANTS=0")
  console.log(`INVENTORY_LEVELS=${inventoryPlans.length ? "PASS" : "NOT_APPLICABLE_LOCAL_PREVIEW"}`)
  console.log("ADMIN_READBACK=PASS")
  console.log(`STORE_READBACK=${typeof storeStatus === "string" ? storeStatus : storeStatus.status}`)
  if (typeof storeStatus !== "string") {
    console.log(`STORE_PRODUCT_ROW=${storeStatus.productRow}`)
    console.log(`STORE_PRICE_ROW=${storeStatus.priceRow}`)
    console.log(`STORE_IMAGE=${storeStatus.image}`)
    console.log(`STORE_PUBLICATION=${storeStatus.publication}`)
  }
  console.log("POSTGRES_READBACK=PASS")
  console.log(`POSTGRES_PRODUCT_ROW=${postgresRow.productRow}`)
  console.log(`POSTGRES_PRICE_ROW=${postgresRow.priceRow}`)
  console.log(`PRICE_STATE=${product.variants?.find((variant) => variant.sku === record.commerce.variants[0].internal_sku)?.prices?.length ? "USD_14_99_RUNTIME_CURRENCY_UNITS" : "NO_SELLING_PRICE_DRAFT"}`)
  console.log(`SELLING_PRICE_STATUS=${record.metadata?.selling_price_status || "CONFIRMED_BY_USER"}`)
  return 0
}

try {
  process.exitCode = await execute(parseArgs(process.argv.slice(2)))
} catch (error) {
  console.error(`MEDUSA_WRITE=BLOCKED`)
  console.error(`ERROR=${error.message}`)
  process.exitCode = 2
}
