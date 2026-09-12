# Medusa repository state

HEAD: 4b7dd0f371f13cc3ee1f598499dcecbf63b33fec
Branch: master

## git status --short

 M apps/backend/.env.template
 M apps/backend/medusa-config.ts
 M apps/backend/package.json
 M apps/backend/src/modules/paypal/__tests__/paypal.unit.spec.ts
 M apps/backend/src/modules/paypal/service.ts
 M apps/storefront/.env.template
 M apps/storefront/next.config.js
 M apps/storefront/package.json
 M apps/storefront/src/app/[countryCode]/(main)/account/@dashboard/profile/page.tsx
 M apps/storefront/src/app/[countryCode]/(main)/cart/page.tsx
 M apps/storefront/src/app/[countryCode]/(main)/categories/[...category]/page.tsx
 M apps/storefront/src/app/[countryCode]/(main)/collections/[handle]/page.tsx
 M apps/storefront/src/app/[countryCode]/(main)/layout.tsx
 M apps/storefront/src/app/[countryCode]/(main)/order/[id]/transfer/[token]/accept/page.tsx
 M apps/storefront/src/app/[countryCode]/(main)/order/[id]/transfer/[token]/decline/page.tsx
 M apps/storefront/src/app/[countryCode]/(main)/products/[handle]/page.tsx
 M apps/storefront/src/app/api/payment-return/route.ts
 M apps/storefront/src/lib/checkout-exposure.ts
 M apps/storefront/src/lib/data/cart.ts
 M apps/storefront/src/lib/data/customer.ts
 M apps/storefront/src/lib/data/orders.ts
 M apps/storefront/src/lib/data/payment.ts
 M apps/storefront/src/lib/data/products.ts
 M apps/storefront/src/lib/data/regions.ts
 M apps/storefront/src/lib/util/money.ts
 M apps/storefront/src/middleware.ts
 M apps/storefront/src/modules/account/components/account-info/index.tsx
 M apps/storefront/src/modules/account/components/profile-email/index.tsx
 M apps/storefront/src/modules/cart/templates/index.tsx
 M apps/storefront/src/modules/checkout/components/addresses/index.tsx
 M apps/storefront/src/modules/checkout/components/error-message/index.tsx
 M apps/storefront/src/modules/checkout/components/payment-button/index.tsx
 M apps/storefront/src/modules/checkout/components/payment/index.tsx
 M apps/storefront/src/modules/checkout/components/review/index.tsx
 M apps/storefront/src/modules/checkout/components/shipping-address/index.tsx
 M apps/storefront/src/modules/checkout/components/shipping/index.tsx
 M apps/storefront/src/modules/common/components/cart-totals/index.tsx
 M apps/storefront/src/modules/common/components/input/index.tsx
 M apps/storefront/src/modules/common/components/line-item-price/index.tsx
 M apps/storefront/src/modules/common/components/line-item-unit-price/index.tsx
 M apps/storefront/src/modules/layout/components/cart-dropdown/index.tsx
 M apps/storefront/src/modules/layout/components/language-select/index.tsx
 M apps/storefront/src/modules/order/components/order-summary/index.tsx
 M apps/storefront/src/modules/order/components/payment-details/index.tsx
 M apps/storefront/src/modules/order/components/shipping-details/index.tsx
 M apps/storefront/src/modules/products/components/image-gallery/index.tsx
 M apps/storefront/src/modules/products/components/product-actions/index.tsx
 M apps/storefront/src/modules/products/templates/index.tsx
 M package.json
 M pnpm-lock.yaml
 M pnpm-workspace.yaml
 M scripts/_common.ps1
 M scripts/acceptance-smoke.ps1
 M scripts/build-production.ps1
 M scripts/medusa-crossborder-augment.ts
 M scripts/start-local.ps1
 M ../../04_docs/scripts/92-prepare-review-staging.ps1
 M ../../05_product/scripts/medusa-product-upsert.mjs
 M ../../05_product/scripts/product-pipeline.mjs
 M ../../05_product/sourcing/scripts/component-pipeline.mjs
 M ../../06_payment/README.md
 M ../../06_payment/providers/paypal/README.md
?? ../../.github/
?? .dockerignore
?? apps/backend/scripts/
?? apps/backend/src/api/__tests__/
?? apps/backend/src/api/checkout-boundary.ts
?? apps/backend/src/api/middlewares.ts
?? apps/backend/src/api/public-catalog.ts
?? apps/backend/src/config/
?? apps/backend/src/modules/paypal-reconciliation/
?? apps/backend/src/modules/paypal/config.ts
?? apps/backend/src/modules/paypal/transport.ts
?? apps/storefront/scripts/
?? apps/storefront/src/modules/order/components/transfer-decision-form/
?? deploy/
?? scripts/process-management.security.tests.ps1
?? scripts/run-runtime-security-tests.ps1
?? scripts/service-identity.security.tests.ps1
?? scripts/verification-gate.security.tests.ps1
?? ../../04_docs/scripts/92-prepare-review-staging.security.tests.ps1
?? ../../05_product/scripts/medusa-inventory-plan.mjs
?? ../../05_product/scripts/medusa-inventory-plan.test.mjs
?? ../../05_product/scripts/medusa-product-payload.mjs
?? ../../05_product/scripts/product-boundary.test.mjs

## git diff --stat

 .../apps/backend/.env.template                     |  24 +-
 .../apps/backend/medusa-config.ts                  | 107 +++--
 .../apps/backend/package.json                      |  19 +-
 .../modules/paypal/__tests__/paypal.unit.spec.ts   | 282 ++++++++++++-
 .../apps/backend/src/modules/paypal/service.ts     | 427 ++++++++++++++++++--
 .../apps/storefront/.env.template                  |   6 +-
 .../apps/storefront/next.config.js                 |  43 +-
 .../apps/storefront/package.json                   |   7 +-
 .../(main)/account/@dashboard/profile/page.tsx     |   3 +-
 .../src/app/[countryCode]/(main)/cart/page.tsx     |  16 +-
 .../(main)/categories/[...category]/page.tsx       |  11 +-
 .../(main)/collections/[handle]/page.tsx           |  15 +-
 .../src/app/[countryCode]/(main)/layout.tsx        |   4 +
 .../order/[id]/transfer/[token]/accept/page.tsx    |  28 +-
 .../order/[id]/transfer/[token]/decline/page.tsx   |  28 +-
 .../(main)/products/[handle]/page.tsx              |   3 +
 .../storefront/src/app/api/payment-return/route.ts |  45 ++-
 .../apps/storefront/src/lib/checkout-exposure.ts   |  41 +-
 .../apps/storefront/src/lib/data/cart.ts           |  82 ++--
 .../apps/storefront/src/lib/data/customer.ts       |  16 +-
 .../apps/storefront/src/lib/data/orders.ts         |  38 +-
 .../apps/storefront/src/lib/data/payment.ts        |   2 +-
 .../apps/storefront/src/lib/data/products.ts       |  45 ++-
 .../apps/storefront/src/lib/data/regions.ts        |  19 +-
 .../apps/storefront/src/lib/util/money.ts          |  38 +-
 .../apps/storefront/src/middleware.ts              |   1 +
 .../account/components/account-info/index.tsx      |  55 +--
 .../account/components/profile-email/index.tsx     |  66 +--
 .../src/modules/cart/templates/index.tsx           |   7 +
 .../checkout/components/addresses/index.tsx        |   6 +-
 .../checkout/components/error-message/index.tsx    |   2 +-
 .../checkout/components/payment-button/index.tsx   |  65 ++-
 .../modules/checkout/components/payment/index.tsx  |  35 +-
 .../modules/checkout/components/review/index.tsx   |   2 +-
 .../checkout/components/shipping-address/index.tsx |   2 +-
 .../modules/checkout/components/shipping/index.tsx |  26 +-
 .../common/components/cart-totals/index.tsx        |  33 +-
 .../src/modules/common/components/input/index.tsx  |   2 +
 .../common/components/line-item-price/index.tsx    |   6 +-
 .../components/line-item-unit-price/index.tsx      |   6 +-
 .../layout/components/cart-dropdown/index.tsx      |   4 +-
 .../layout/components/language-select/index.tsx    |   2 -
 .../order/components/order-summary/index.tsx       |   9 +-
 .../order/components/payment-details/index.tsx     |  26 +-
 .../order/components/shipping-details/index.tsx    |   4 +-
 .../products/components/image-gallery/index.tsx    |   5 +-
 .../products/components/product-actions/index.tsx  |  40 +-
 .../src/modules/products/templates/index.tsx       |   2 +-
 03_template/medusa-crossborder-base/package.json   |  18 +-
 03_template/medusa-crossborder-base/pnpm-lock.yaml | 448 +++++++++++++--------
 .../medusa-crossborder-base/pnpm-workspace.yaml    |   9 +
 .../medusa-crossborder-base/scripts/_common.ps1    | 231 ++++++++++-
 .../scripts/acceptance-smoke.ps1                   |   2 +
 .../scripts/build-production.ps1                   |  13 +-
 .../scripts/medusa-crossborder-augment.ts          |   2 +-
 .../scripts/start-local.ps1                        |  26 +-
 04_docs/scripts/92-prepare-review-staging.ps1      | 195 ++++++++-
 05_product/scripts/medusa-product-upsert.mjs       | 194 ++++-----
 05_product/scripts/product-pipeline.mjs            | 117 +++---
 05_product/sourcing/scripts/component-pipeline.mjs |  40 +-
 06_payment/README.md                               |   6 +-
 06_payment/providers/paypal/README.md              |  13 +-
 62 files changed, 2231 insertions(+), 838 deletions(-)

## parent workspace status

 M payment/paypal/PAYPAL_INTEGRATION_CONTRACT.md
 M payment/paypal/PAYPAL_TEST_MATRIX.md
?? operations/EXTERNAL_PREREQUISITES.md
?? operations/FULFILLMENT_READINESS.md
