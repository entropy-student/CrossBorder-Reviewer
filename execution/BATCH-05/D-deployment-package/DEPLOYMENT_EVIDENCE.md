# Deployment Preparation Evidence

Preparation artifacts are in the source project `03_template/medusa-crossborder-base/deploy/`.

- Vercel is documented as storefront-only.
- Medusa backend is represented as a platform-neutral Linux container with
  separate server/worker commands and migration/rollback notes.
- Supabase runtime and migration connection roles are separated in the plan.
- Upstash requires native TLS `rediss://` for production Redis modules.
- Cloudflare R2, optional Resend and Cloudflare DNS contracts are documented;
  no resource, DNS record, secret, email or deployment was created.
- Production infrastructure modules fail closed when not enabled.
- No backend host was selected. See the root `BACKEND_HOST_DECISION.md`.
