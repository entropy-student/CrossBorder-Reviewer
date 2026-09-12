# Pawfectly Home Product Content

This source-side README is `SOURCE_BOUND=YES` and
`HUMAN_WORKING_DOCUMENT=NO`. Current human-facing contracts are maintained in
the parent document center.

This directory is the product-content boundary for the frozen Medusa Mother
Template. It contains the fact-first Product Master contract and a review-safe
pipeline for future real supplier records.

Start with:

1. [Product Data Contract](../../product/PRODUCT_DATA_CONTRACT.md)
2. [Product Import Guide](../../product/PRODUCT_IMPORT_GUIDE.md)
3. [intake/PRODUCT_INTAKE_TEMPLATE.json](intake/PRODUCT_INTAKE_TEMPLATE.json)
4. `node scripts/product-pipeline.mjs validate --input <record.json>`
5. `node scripts/product-pipeline.mjs dry-run --input <record.json>`
6. `node scripts/product-pipeline.mjs test --input <fixture.json>`

For supplier components and bundle candidates, see the
[Component Data Contract](../../product/sourcing/COMPONENT_DATA_CONTRACT.md).

The included `TEST_FIXTURE_ONLY.medusa-seed.json` is only a deterministic
technical fixture. The first user-supplied integration record is
[normalized/PAWFECTLY-PET-HAIR-REMOVER.json](normalized/PAWFECTLY-PET-HAIR-REMOVER.json),
which is `PUBLISHED` in the local preview runtime with an internal SKU and
the user-approved source image. Its project-owned inventory remains unknown;
local preview availability is not a production stock assertion.
The current canonical Product Master schema is `1.1.0`. Schemas, data and
scripts remain beside the product boundary; the document center is the single
human-facing authority.
