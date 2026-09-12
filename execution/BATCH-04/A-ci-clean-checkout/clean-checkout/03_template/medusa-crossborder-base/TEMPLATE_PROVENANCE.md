# Medusa Cross-border Mother Template Provenance

TECHNOLOGY_SELECTION=MEDUSA
TEMPLATE_STATUS=FROZEN_AFTER_CB-DEV-018
SOURCE_BASELINE=02_demos/medusa-dtc
SOURCE_BASELINE_COMMIT=5d3e644ebf7812453e2be000eba2f497423e5c02
SOURCE_BASELINE_TYPE=local_baseline_commit
ORIGIN=https://github.com/medusajs/dtc-starter
ACQUISITION_MODE=official_archive_fallback
ARCHIVE_SHA256=ea7c88e159828fc2980a376186c331f0ce7496fa317665e15d653a00620bcc12
UPSTREAM_COMMIT=UNRESOLVED
MEDUSA_VERSION=2.19.0
PROJECT_PNPM=10.11.1
NODE_ENGINE=^20.19.0 || >=22.12.0

The baseline data is created by the checked-in migration
apps/backend/src/migration-scripts/initial-data-seed.ts. US/USD is a separate,
rerun-safe augmentation performed by scripts/medusa-crossborder-augment.ts.

CB-DEV-018 validation used a new Docker Compose project named
medusa-template-validation, a new PostgreSQL volume named
medusa-template-validation_pgdata, and local ports 54332, 9500, and 8500.
Those runtime artifacts and credentials are not part of this template.
