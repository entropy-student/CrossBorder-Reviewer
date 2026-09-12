# Medusa Cross-border Mother Template

This README is `SOURCE_BOUND=YES` and `HUMAN_WORKING_DOCUMENT=NO`; current
human-facing project documents are maintained in the parent document center.

This is the selected Medusa DTC Starter mother template for the project.
It contains the validated application source, locked dependencies, migration
seed, cross-border augmentation, smoke tests, and local runners. Spree remains
available under 02_demos as a benchmark reference and is not part of this
template.

## Configuration contract

Baseline initialization comes from the Medusa migration
`apps/backend/src/migration-scripts/initial-data-seed.ts` and provides:

- Europe / EUR baseline
- Store and catalog
- Tax regions
- Stock location and inventory
- Fulfillment and baseline shipping

Cross-border augmentation is separate and rerun-safe. The augmentation script
adds or reuses:

- United States / USD
- US warehouse and sales-channel mapping
- test-only US shipping fixture for local validation
- System Payment technical smoke route

Do not use a historical database or copy a Docker volume into a new setup.

## Toolchain

- Node: `^20.19.0 || >=22.12.0`
- pnpm: `10.11.1`, selected through Corepack from `package.json`
- PostgreSQL: `postgres:16-alpine` in the local Compose definition
- Medusa: `2.19.0`

## One-command local bootstrap

From this directory, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
```

The runner creates local runtime env files under ignored paths, starts the
template-owned PostgreSQL volume, installs with the frozen lockfile, runs
migrations, verifies the migration seed, applies US/USD augmentation, creates
a new local Admin in the validation database, obtains the publishable key, runs
production builds, starts production processes, and executes US/USD plus
France/EUR Store/Admin/PostgreSQL smoke tests.

If no project name is supplied on the first setup, the runner generates a
lowercase Compose-safe project identity from this copy's folder plus a short
unique suffix. It persists that identity with the default PostgreSQL `54332`,
backend/Admin `9500`, and storefront `8500` ports in ignored
`.runtime/local-config.json`. This prevents two fresh copies from silently
sharing a default volume. An existing volume is allowed only for a configured
copy whose saved project identity matches its Compose label; a fresh copy is
blocked before runtime config or Docker startup when its volume already exists.
The scripts accept a configurable project name and all three ports. Later
start, build, and smoke commands require the saved runtime contract and reject
explicit values that do not match it. Known historical and repeat project
names are guarded.

For a disposable non-default validation, use one fresh template copy and pass
all four values together, for example:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1 `
  -ProjectName medusa-template-portability-test `
  -DatabasePort 55432 -BackendPort 19500 -StorefrontPort 18500
```

## Local development start

After bootstrap, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

The local production-mode URLs are:

- Admin: `http://localhost:9500/app`
- Storefront: `http://localhost:8500/us`
- Backend health: `http://localhost:9500/health`

The built backend must start from `apps/backend/.medusa/server`; the runner
handles this Medusa v2 caveat.

## Production build

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-production.ps1
```

This performs a clean backend build and a clean Next.js storefront build using
the declared pnpm version. It requires the local backend to be available while
the storefront fetches catalog data.

## Acceptance smoke

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\acceptance-smoke.ps1
```

The smoke uses direct SDK/API calls against the technical shipping and System Payment fixtures, then verifies the disposable order through Store API, Admin API, and PostgreSQL. It repeats the same core checks for France/EUR. These fixtures are deliberately hidden from normal customer checkout.

## Customer checkout safety boundary

The storefront defaults to `NEXT_PUBLIC_CHECKOUT_EXPOSURE_MODE=customer`. In this mode, Medusa System Payment and known local/manual shipping fixtures are not offered to shoppers. The direct SDK acceptance smoke still uses them for local technical validation.

Set `NEXT_PUBLIC_CHECKOUT_EXPOSURE_MODE=technical_test` only for an explicit local UI smoke session. Never use that mode for a customer-facing sandbox or live deployment. A real or reusable external payment system must be integrated through the [payment architecture](../../../payment/PAYMENT_ARCHITECTURE.md) and the Medusa Payment Module boundary.

## Secrets and generated files

`.env.template` and `.env.example` contain safe structure and placeholders
only. `setup-local.ps1` generates local JWT/Cookie secrets and stores the new
Admin credential and publishable key only under ignored `.runtime` and runtime
env files. Never copy those generated files into Git, a Review Bundle, or this
template source tree.
