# Demo Validation Workspace

Runtime candidates live here. No runnable-demo claim is made until software has actually executed on a runtime-capable workstation.

```text
02_demos/
├── medusa-local/       # disposable PostgreSQL config
├── medusa-dtc/         # official runtime clone, Git-ignored
└── spree-demo/         # CB-DEV-014 official Spree baseline/demo, separate Git baseline
```

## Candidate 1 — Medusa
Official target: `medusajs/dtc-starter`.

Local design:
- backend/storefront directly under Windows Node;
- PostgreSQL 16 in Docker on `127.0.0.1:54329`;
- Redis excluded from first validation;
- exact starter pnpm version;
- migration-based initial-data seed capability detected from the checked-out backend rather than assumed;
- use the archived [DEMO_BOOTSTRAP.md](../../archive/legacy-runbooks/DEMO_BOOTSTRAP.md) only for historical US/USD augmentation after baseline initialization;
- no real payment account.

## Candidate 2 — Spree
Official target: current `create-spree-app` flow plus current Spree Storefront.

CB-DEV-014 verified Spree's official prebuilt Quick Start runtime, sample products, Store API checkout, and US/USD order. Storefront UI payment evidence remains partial because the seeded Check method was not exposed by the current storefront UI. CB-DEV-016 is reserved for local application-source qualification; it must use an independent Compose project and physical database volume.

## Freeze condition
See the current [Acceptance Gates](../../operations/ACCEPTANCE_GATES.md). Installation success alone is not enough.
