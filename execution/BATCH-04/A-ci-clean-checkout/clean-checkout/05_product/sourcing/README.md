# Sourcing Components and Bundle BOM

`SOURCE_BOUND=YES`; `HUMAN_WORKING_DOCUMENT=NO`. Human-facing sourcing
contracts and checklists are maintained in the parent document center.

This directory is separate from the sellable Product Master. It records
supplier-side components and bundle candidates before a sellable Pawfectly
product is approved.

## Current record

`components/COMP-001-pet-hair-remover.json` is the first supplied component
record. It is a `CORE_COMPONENT` candidate for `Pet Fur Rescue Kit`, not an
independent sellable product and not a Medusa product.

The future bundle has the stable identifier `BUNDLE-PET-FUR-RESCUE-KIT`. The
current BOM is only `BOM-PET-FUR-RESCUE-KIT-DRAFT` and contains `COMP-001 x 1`.
It is not a final bundle or sellable-product definition.

Expected current validation:

```text
COMPONENT_RECORD=NEEDS_VERIFICATION
SOURCE_GATE=PASS
SAMPLE_GATE=NEEDS_TEST
PROCUREMENT_GATE=HOLD
LOGISTICS_GATE=NEEDS_VERIFICATION
RISK_GATE=NEEDS_VERIFICATION
SAMPLE_SCORE=NOT_TESTED
HARD_FAIL=NOT_TESTED
QUOTE_RECONFIRMATION_REQUIRED=YES
MEDUSA_WRITE=NO
```

## Workflow

```text
supplier material
      -> component intake
      -> source/claim labelling
      -> component validation
      -> physical sample AB test
      -> procurement decision
      -> draft BOM
      -> separately approved sellable Product Master
```

Run from the project root:

```powershell
node .\05_product\sourcing\scripts\component-pipeline.mjs validate `
  --input .\05_product\sourcing\components\COMP-001-pet-hair-remover.json

node .\05_product\sourcing\scripts\component-pipeline.mjs validate-bom `
  --input .\05_product\sourcing\bom\PET-FUR-RESCUE-KIT.draft.json

node .\05_product\sourcing\scripts\component-pipeline.mjs test `
  --input .\05_product\sourcing\components\COMP-001-pet-hair-remover.json
```

The validator is read-only. It does not call Medusa, write a catalog, create
an order, buy samples or place a bulk order.

Sample testing is documented under [testing/](testing/). It is scoped to
COMP-001 only. No physical sample has been received, so the scorecard and
result template intentionally contain no measured result or score.

## Evidence rules

- `SUPPLIER_CLAIM` means the supplier stated or advertised it; it is not
  independent verification.
- `IMAGE_EVIDENCE_ONLY` records what an image appears to show; it does not
  establish a supplier variant/SKU.
- `SUPPLIED_FACT` records a fact supplied for this project; it does not imply
  independent verification.
- Missing facts remain `null` with `status=UNKNOWN` or
  `status=NEEDS_VERIFICATION`. Never infer a country of origin, HS code,
  package measurement, consumer dropship capability or legal clearance.

See the [Component Data Contract](../../../product/sourcing/COMPONENT_DATA_CONTRACT.md)
and the reusable [BOM schema](schemas/bundle-bom.schema.json).
