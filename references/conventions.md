# Conventions

## CI / GitHub Actions

- `enforce-main.yml` — force-pushes any non-main branch to `main`, then triggers `build.yml` via `workflow_dispatch`
- `build.yml` — multi-arch Docker build (amd64 + arm64), push to `ghcr.io/claudeailab/webapp`
- GHCR login uses `secrets.CR_PAT`, never `secrets.GITHUB_TOKEN`
- Version tag format: `ghcr.io/claudeailab/webapp:v{version}` + `:latest`

## Docker Image

- Registry: `ghcr.io/claudeailab/webapp`
- Base: `node:22-alpine`, standalone Next.js output
- Multi-arch manifest via `docker buildx imagetools create`

## Environment Variables

All prefixed `WEBAPP_`. Never `NEXT_PUBLIC_*`. Stored server-side only.

**Core vars:** `WEBAPP_JWT_SECRET`, `WEBAPP_ADMIN_JWT_SECRET`, `WEBAPP_ENCRYPTION_KEY`, `WEBAPP_ADMIN_EMAIL`, `WEBAPP_ADMIN_PASSWORD`, `WEBAPP_DB_{HOST,PORT,USER,PASSWORD,NAME}`

**Feature flags** (enable instrumentation startup checks):
`WEBAPP_M365_ENABLED`, `WEBAPP_SMTP_ENABLED`, `WEBAPP_ANTHROPIC_ENABLED`, `WEBAPP_OPENAI_ENABLED`, `WEBAPP_STRIPE_ENABLED`

**Settings overrides** — when any of these are set, `getSetting()` returns the env value instead of querying the DB. The integration appears pre-configured in the admin UI automatically.

```
# AI
WEBAPP_ANTHROPIC_API_KEY        → anthropic_apiKey
WEBAPP_ANTHROPIC_MODEL          → anthropic_model
WEBAPP_OPENAI_API_KEY           → openai_apiKey
WEBAPP_OPENAI_MODEL             → openai_model

# Email / SMTP
WEBAPP_SMTP_HOST                → smtp_host
WEBAPP_SMTP_PORT                → smtp_port
WEBAPP_SMTP_SSL                 → smtp_ssl        (true/false)
WEBAPP_SMTP_USER                → smtp_user
WEBAPP_SMTP_PASSWORD            → smtp_password
WEBAPP_SMTP_FROM_NAME           → smtp_fromName
WEBAPP_SMTP_FROM_EMAIL          → smtp_fromEmail

# Microsoft 365
WEBAPP_M365_CLIENT_ID           → m365_clientId
WEBAPP_M365_CLIENT_SECRET       → m365_clientSecret
WEBAPP_M365_TENANT_ID           → m365_tenantId
WEBAPP_M365_EXPIRY_DATE         → m365_expiryDate   (ISO date, e.g. 2026-12-31)
WEBAPP_M365_REMINDER_DAYS       → m365_reminderDays  (default 30)

# Stripe
WEBAPP_STRIPE_LIVE_MODE         → stripe_liveMode    (true/false)
WEBAPP_STRIPE_PUBLISHABLE_KEY   → stripe_publishableKey
WEBAPP_STRIPE_SECRET_KEY        → stripe_secretKey
WEBAPP_STRIPE_WEBHOOK_SECRET    → stripe_webhookSecret

# PayPal
WEBAPP_PAYPAL_ENABLED           → paypal_enabled     (true/false)
WEBAPP_PAYPAL_LIVE_MODE         → paypal_liveMode    (true/false)
WEBAPP_PAYPAL_CLIENT_ID         → paypal_clientId
WEBAPP_PAYPAL_CLIENT_SECRET     → paypal_clientSecret

# Viva Wallet
WEBAPP_VIVA_ENABLED             → vivawallet_enabled  (true/false)
WEBAPP_VIVA_LIVE_MODE           → vivawallet_liveMode (true/false)
WEBAPP_VIVA_CLIENT_ID           → vivawallet_clientId
WEBAPP_VIVA_CLIENT_SECRET       → vivawallet_clientSecret
WEBAPP_VIVA_MERCHANT_ID         → vivawallet_merchantId
```

The mapping lives in `src/lib/encryption.ts` → `ENV_SETTING_MAP`.

## Database

MySQL + Drizzle ORM. Table prefix: `webapp_`. Auto-migrated on startup. AES-256-GCM encryption for all settings stored in `webapp_settings`.

## Versioning

`version.json` is the source of truth. `package.json` and `package-lock.json` must match. Bump all three on every push.

## MCP GitHub Tools (vs curl)

Always prefer `mcp__github__*` tools over curl for GitHub API calls — the MCP server is not subject to CCR proxy restrictions. Use curl only for GHCR registry API (`ghcr.io/v2/...`) or non-Actions GitHub REST reads.
