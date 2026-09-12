# Inventory and Catalog Evidence

## Inventory

`node 05_product/scripts/medusa-inventory-plan.test.mjs`
returned exit code `0`:

```text
MEDUSA_INVENTORY_PLAN_TEST=PASS
MEDUSA_WRITE=NO
```

The plan now reads an existing item/location level before deciding create vs
update and verifies the resulting stocked/reserved/available values in the
write adapter. Production inventory write was not enabled because
`PROJECT_OWNED_INVENTORY=UNKNOWN`. No inventory level was written to the live
database and no concurrency proof was claimed.

## Customer catalog boundary

- Store API product projection filters to explicitly approved Pawfectly
  products and removes private metadata.
- Runtime read-only Store API returned exactly one approved product:
  `prod_01M1JG54Z6PFY802QV32EJ174D`, handle `pet-hair-remover`, SKU
  `PAW-PHR-001`, USD `14.99`.
- Seed/demo products remain preserved in technical data and were not deleted.
- Public projection route coverage is unit-tested for products, carts, line
  items, completion, orders, payment sessions and shipping selections.
- A real Store API payment-session integration test was not executed because
  PayPal sandbox OAuth was blocked before a session/order could be created.
