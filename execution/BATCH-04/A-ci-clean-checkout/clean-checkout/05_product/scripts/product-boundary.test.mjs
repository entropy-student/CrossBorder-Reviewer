#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "../..")
const pipeline = path.join(root, "05_product", "scripts", "product-pipeline.mjs")
const fixture = path.join(root, "05_product", "intake", "TEST_FIXTURE_ONLY.medusa-seed.json")

const result = spawnSync(process.execPath, [pipeline, "dry-run", "--input", fixture, "--json"], { cwd: root, encoding: "utf8" })
if (result.status !== 0) throw new Error(result.stderr || "product dry-run failed")
const plan = JSON.parse(result.stdout)
const metadata = plan.medusa_payload.metadata || {}
const privateKeys = Object.keys(metadata).filter((key) => /cost|supplier|operations|cross_border|physical|hs_code|provenance/i.test(key))
if (privateKeys.length) throw new Error("public metadata contains private keys: " + privateKeys.join(","))
if (!Array.isArray(plan.medusa_payload.variants) || plan.medusa_payload.variants.length !== 1) throw new Error("dry-run variant mapping is incomplete")
console.log("PRODUCT_PUBLIC_METADATA=PASS")
console.log("PRODUCT_DRY_RUN_ALL_VARIANTS=PASS")
console.log("PRODUCT_BOUNDARY_TEST=PASS")
