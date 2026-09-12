# BATCH-05 Inventory / Catalog Independent Review

## Decision

`BATCH05_INVENTORY_CATALOG=RETURN`

The pure inventory-plan and catalog-projection units pass, and the current real
product remains safely in local-preview mode. BATCH-05 does **not** satisfy its
own required real isolated-Medusa inventory proof or complete Store API privacy
boundary. Production inventory and launch readiness must remain closed.

| Gate | Decision |
|---|---|
| Pure inventory plan/request-shape unit | PASS |
| Current real-product no-write safety | PASS |
| Source payload metadata minimization | PASS |
| Inventory idempotent integration | RETURN |
| Isolated PostgreSQL + real Medusa create/rerun/update/concurrency | RETURN / NOT RUN |
| Stock location + sales channel + product relation | RETURN |
| Stocked/reserved/available semantic read-back | RETURN |
| Pure Store response projector | PASS |
| Complete customer-reachable Store API projection | RETURN |
| Production inventory/customer availability | HOLD |

## Independent verification

- `medusa-inventory-plan.test.mjs`: PASS, `MEDUSA_WRITE=NO`.
- `public-catalog.unit.spec.ts`: 3/3 PASS.
- A read-only PostgreSQL transaction completed and committed without mutation.
- Main source HEAD remained
  `4b7dd0f371f13cc3ee1f598499dcecbf63b33fec`; this review made no source or
  business-database writes.

Evidence:

- `inventory-plan-unit.log`
- `public-catalog-unit.log`
- `inventory-static-probe.log`
- `current-runtime-readonly.sql`
- `current-runtime-readonly.log`

## Findings

### R1 — Published product can become visible before inventory succeeds (release blocker)

`medusa-product-upsert.mjs:316-321` selects the final `published` status and
builds that payload before the write. It writes the product at lines 340-344,
then synchronizes inventory at lines 345-347. If location lookup, inventory
create/update, or read-back fails, a published managed-inventory product can be
left partially configured.

For `--publish + PRODUCTION_INVENTORY`, write/update the product as draft,
create and validate every inventory link/level and sales-channel relation, then
perform the final publish transition. A Medusa workflow transaction is better;
otherwise persist a resumable step state and fail closed until all read-backs
pass.

### R2 — Required real isolated inventory integration was not executed

The BATCH-05 task required an isolated DB and real Medusa proof for:
create -> same-quantity rerun -> changed-quantity rerun -> concurrency, with one
level, inventory-item/variant link, channel relation, and Store API availability.
The submitted `INVENTORY_EVIDENCE.md:13-17` explicitly says only a pure plan was
tested, production writes were disabled, and no concurrency proof was claimed.

This is honest evidence, but it means the finding cannot be marked `CLOSED
LOCALLY`. It remains RETURN until a disposable Medusa database proves the real
API behavior. The existing business database must not be used for that test.

### R3 — Inventory sync never checks the stock-location/sales-channel/product chain

`syncInventoryLevels` (`medusa-product-upsert.mjs:281-305`) only reads and writes
location levels. It has no lookup or assertion for:

- the target stock location existing and being active;
- the stock location being linked to the intended sales channel;
- the product being assigned to that sales channel;
- the publishable API key resolving to the same sales channel;
- Store API inventory quantity for the intended region/channel.

The read-only runtime query confirms two locations are linked to the default
sales channel, but the target product has no active `product_sales_channel` row.
The current product also has `manage_inventory=false`, no active inventory-item
link, and no level. That is correct for `LOCAL_PREVIEW_AVAILABILITY`; it is not
production-inventory evidence.

Add explicit IDs for the intended sales channel and location, validate all
links before publication, and prove customer-visible availability using the
same publishable key/region as the Storefront.

### R4 — Read-before-create is still race-prone

At `medusa-product-upsert.mjs:284-296`, two writers can both observe no level and
both issue create. The code has no conflict reconciliation, lock, idempotency
key, or post-conflict read-back path. A database unique constraint may preserve
one row, but one invocation can still fail after the product write. This is not
the concurrency behavior required by BATCH-05.

Use a server-side workflow/transaction where possible. If Medusa returns 409,
re-read the exact item/location pair and accept it only when its durable state
matches the requested state; otherwise update through the documented endpoint
and verify once. Test two concurrent real requests against the disposable DB.

### R5 — Available and reserved quantities are checked only for presence

`medusa-product-upsert.mjs:299-304` asserts `stocked_quantity` numerically, but
only checks that `reserved_quantity` and `available_quantity` are not
`undefined`. Zero, a negative number, a stale number, or a value for the wrong
sales-channel context all pass. The independent static probe confirms there is
no numeric value assertion.

Define whether Product Master `inventory_quantity` means physical stocked
quantity or customer-available quantity. Then assert stocked, reserved and
available numerically, including reservation creation/release and Store API
availability for the selected channel.

### R6 — The pure plan trusts location and inventory relations that only the server can validate

`medusa-inventory-plan.mjs:11-35` checks only that a location string and first
inventory relation exist. The independent negative probe showed it accepts a
nonexistent location and accepts two variants mapped to the same
inventory-item/location pair. This is acceptable for a pure request builder,
but it cannot serve as proof that the plan is valid or idempotent.

Reject duplicate item/location pairs, require exactly one intended relation per
variant, and make server read-back the acceptance gate.

### R7 — Store API route matrix omits customer-reachable responses

The recursive projector itself is sound for exact `product`, `products`,
`variant`, and `variants` keys (`public-catalog.ts:40-68`), and its 3 unit tests
pass. The middleware registration (`middlewares.ts:139-214`) does not cover at
least:

- `GET /store/product-variants`;
- `GET /store/product-variants/:id`;
- `POST /store/carts/:id/customer`;
- `POST|DELETE /store/carts/:id/promotions`;
- `POST /store/carts/:id/taxes`.

Medusa 2.19's product-variant endpoints include variant `metadata` in their
default response. The three cart mutations return a refetched cart, which can
contain nested product/variant metadata. Product tag/type routes also expose
nested products by default and should be included or explicitly proven safe.
The submitted route matrix therefore overstates complete coverage.

Register the projection on every response route that can contain product or
variant objects, or enforce the policy in a single Store API serializer/hook
that cannot be bypassed by adding a route. Add HTTP tests that seed private
legacy keys and call every matrix route directly; pure-function tests are not
enough.

## What is already correct and should remain unchanged

- Keep the real product in `LOCAL_PREVIEW_AVAILABILITY` with
  `manage_inventory=false` until inventory ownership and fulfillment are known.
- Keep `--production-inventory-write` as a separate explicit gate.
- Keep the public-payload builder's source allowlist. Read-only DB inspection
  found only `pawfectly_*` public keys on the current product and variant; no
  supplier/cost/procurement keys were present.
- Keep the recursive public response projector and extend its route coverage.
- Do not use the existing product database for concurrency fixtures and do not
  invent stock, carrier, origin, HS, or fulfillment facts.

## Required closure evidence

1. A disposable Medusa 2.19 DB log showing location/channel/product/key links.
2. Real API create, identical rerun, changed quantity rerun, and concurrent
   requests with exactly one level.
3. Numeric stocked/reserved/available read-back plus Store API availability for
   the intended region/channel; quantity 0/1 reservation and release cases.
4. Proof that a production product remains draft until all inventory checks
   pass.
5. HTTP Store API privacy tests for the full route matrix, including the five
   omitted routes above and legacy private metadata fixtures.

