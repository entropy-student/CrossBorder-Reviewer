# Sourcing Pipeline

`component-pipeline.mjs` is a dependency-free, read-only validator for
sourcing components and draft BOMs.

- `validate`: validates a component record and reports SOURCE, SAMPLE,
  PROCUREMENT, LOGISTICS and RISK gates, including the stable bundle ID,
  structured bulk-shipping quote and sample readiness fields.
- `validate-bom`: validates a draft bundle BOM reference.
- `test`: runs the COMP-001 evidence-preservation regression checks.

The script performs no Medusa API call, no catalog write, no order creation,
no database mutation and no procurement action.
