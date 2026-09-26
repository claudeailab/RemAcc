# Conventions

## CI / GitHub Actions

- `enforce-main.yml` — force-pushes any non-main branch to `main`, then triggers `build.yml` via `workflow_dispatch`
- `build.yml` — multi-arch Docker build (amd64 + arm64), push to `ghcr.io/claudeailab/wetman`
- GHCR login uses `secrets.CR_PAT`, never `secrets.GITHUB_TOKEN`
- Version tag format: `ghcr.io/claudeailab/wetman:v{version}` + `:latest`

## Docker Image

- Registry: `ghcr.io/claudeailab/wetman`
- Base: `node:22-alpine`, standalone Next.js output
- Multi-arch manifest via `docker buildx imagetools create`

## Environment Variables

All prefixed `WETMAN_`. Never `NEXT_PUBLIC_*`. Stored server-side only.

**Core vars:** `WETMAN_JWT_SECRET`, `WETMAN_ADMIN_JWT_SECRET`, `WETMAN_ENCRYPTION_KEY`, `WETMAN_ADMIN_EMAIL`, `WETMAN_ADMIN_PASSWORD`, `WETMAN_DB_{HOST,PORT,USER,PASSWORD,NAME}`

**Settings overrides** — when any of these are set, `getSetting()` returns the env value instead of querying the DB. The integration appears pre-configured in the admin UI automatically. The mapping lives in `src/lib/encryption.ts` → `getEnvOverride()`.

```
# AI
WETMAN_ANTHROPIC_ENABLED        → anthropic_enabled  (true/false, default true)
WETMAN_ANTHROPIC_API_KEY        → anthropic_apiKey
WETMAN_ANTHROPIC_MODEL          → anthropic_model
WETMAN_OPENAI_ENABLED           → openai_enabled     (true/false, default true)
WETMAN_OPENAI_API_KEY           → openai_apiKey
WETMAN_OPENAI_MODEL             → openai_model

# Email / SMTP
WETMAN_SMTP_ENABLED             → smtp_enabled       (true/false, default true)
WETMAN_SMTP_HOST                → smtp_host
WETMAN_SMTP_PORT                → smtp_port
WETMAN_SMTP_SSL                 → smtp_ssl           (true/false)
WETMAN_SMTP_USER                → smtp_user
WETMAN_SMTP_PASSWORD            → smtp_password
WETMAN_SMTP_FROM_NAME           → smtp_fromName
WETMAN_SMTP_FROM_EMAIL          → smtp_fromEmail

# Microsoft 365
WETMAN_M365_ENABLED             → m365_enabled       (true/false, default true)
WETMAN_M365_CLIENT_ID           → m365_clientId
WETMAN_M365_CLIENT_SECRET       → m365_clientSecret
WETMAN_M365_TENANT_ID           → m365_tenantId
WETMAN_M365_EXPIRY_DATE         → m365_expiryDate    (ISO date, e.g. 2026-12-31)
WETMAN_M365_REMINDER_DAYS       → m365_reminderDays  (default 30)

# Stripe
WETMAN_STRIPE_ENABLED           → stripe_enabled     (true/false, default true)
WETMAN_STRIPE_LIVE_MODE         → stripe_liveMode    (true/false)
WETMAN_STRIPE_PUBLISHABLE_KEY   → stripe_publishableKey
WETMAN_STRIPE_SECRET_KEY        → stripe_secretKey
WETMAN_STRIPE_WEBHOOK_SECRET    → stripe_webhookSecret

# PayPal
WETMAN_PAYPAL_ENABLED           → paypal_enabled     (true/false)
WETMAN_PAYPAL_LIVE_MODE         → paypal_liveMode    (true/false)
WETMAN_PAYPAL_CLIENT_ID         → paypal_clientId
WETMAN_PAYPAL_CLIENT_SECRET     → paypal_clientSecret

# Viva Wallet
WETMAN_VIVA_ENABLED             → vivawallet_enabled  (true/false)
WETMAN_VIVA_LIVE_MODE           → vivawallet_liveMode (true/false)
WETMAN_VIVA_CLIENT_ID           → vivawallet_clientId
WETMAN_VIVA_CLIENT_SECRET       → vivawallet_clientSecret
WETMAN_VIVA_MERCHANT_ID         → vivawallet_merchantId
```

## Database

MySQL + Drizzle ORM. Table prefix: `webapp_`. Auto-migrated on startup. AES-256-GCM encryption for all settings stored in `webapp_settings`.

## Versioning

`version.json` is the source of truth. `package.json` and `package-lock.json` must match. Bump all three on every push.

## MCP GitHub Tools (vs curl)

Always prefer `mcp__github__*` tools over curl for GitHub API calls — the MCP server is not subject to CCR proxy restrictions. Use curl only for GHCR registry API (`ghcr.io/v2/...`) or non-Actions GitHub REST reads.
