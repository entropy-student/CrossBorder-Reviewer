# Product Pipeline Scripts

`product-pipeline.mjs` is dependency-free and supports:

- `validate`: field and gate validation with structured issue output.
- `normalize`: deterministic trimming/currency/price normalization without
  filling unknown facts; rejects pre-1.1.0 records instead of inferring old
  measurement shapes.
- `dry-run`: validation + normalization + request-shaped Medusa mapping with
  `WRITE_PERFORMED=NO`.
- `test`: dependency-free adversarial contract, normalization and dry-run
  regression matrix.

`validate` performs the runtime structural/schema-equivalent check first. A
schema-invalid record prints `VALIDATE_RESULT=BLOCKED` and
`DRY_RUN_NOT_ATTEMPTED`. The pipeline itself performs no catalog reset or HTTP
write. The separate `medusa-product-upsert.mjs` adapter is the only catalog
writer for the current task and preserves source-ID/SKU idempotency.

User-supplied records may pass the store-integration import path with an
explicitly unknown selling price, but remain unpublished until the price and
publish requirements are satisfied. The adapter remains dry-run unless
`--write` is explicitly supplied and verifies the local Mother Template target
before writing. `--publish` is a separate explicit local activation request.

## Local Medusa upsert and local publication

From the project root, validate first:

```powershell
node .\05_product\scripts\medusa-product-upsert.mjs `
  --input .\05_product\normalized\PAWFECTLY-PET-HAIR-REMOVER.json `
  --template .\03_template\medusa-crossborder-base `
  --project-name <saved-local-project>
```

For the local Mother Template runtime only, add `--write`. The adapter checks
the saved local project identity, PostgreSQL container/volume, US/USD region and
local Admin credential before creating or updating the same source-identified
product. Add `--write --publish` only for an explicitly approved `PUBLISHED`
record whose publish gate passes. It then performs Admin, Store and PostgreSQL
read-back without changing historical orders.
