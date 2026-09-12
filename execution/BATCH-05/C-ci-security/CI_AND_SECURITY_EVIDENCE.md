# CI and Security Evidence

- Windows CI workflow retained and Linux clean job added under `.github/`.
- Jobs use Node 20/pnpm 10.11.1, frozen install, typecheck, lint, tests and
  production builds. Remote GitHub execution was not available in this local
  run; workflow YAML is the implementation evidence.
- TypeScript: `PASS`, exit `0`.
- Backend PayPal/unit/contracts: `PASS`, 33 tests, exit `0`.
- Lint: `PASS`, exit `0`; storefront emits only the existing deprecated config
  notice, with no lint error.
- Production build: `PASS`, exit `0`; Next.js `15.5.24`.
- CSP production removes `unsafe-eval` and includes only the reviewed Stripe
  script source; PayPal sandbox source is not enabled in the customer runtime.
- Runtime headers/routes were checked locally; no production host was changed.
