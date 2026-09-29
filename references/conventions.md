# Conventions

## CI / GitHub Actions

- `enforce-main.yml` — force-pushes any non-main branch to `main`, then triggers `build.yml` via `workflow_dispatch`
- `build.yml` — multi-arch Docker build (amd64 + arm64), push to `ghcr.io/claudeailab/remacc`
- GHCR login uses `secrets.CR_PAT`, never `secrets.GITHUB_TOKEN`
- Version tag format: `ghcr.io/claudeailab/remacc:v{version}` + `:latest`

## Docker Image

- Registry: `ghcr.io/claudeailab/remacc`
- Base: `node:22-alpine`, standalone Next.js output
- Multi-arch manifest via `docker buildx imagetools create`

## Environment Variables

All prefixed `REMACC_`. Never `NEXT_PUBLIC_*`. Stored server-side only.

**Core vars:** `REMACC_JWT_SECRET`, `REMACC_ADMIN_JWT_SECRET`, `REMACC_ENCRYPTION_KEY`, `REMACC_ADMIN_EMAIL`, `REMACC_ADMIN_PASSWORD`, `REMACC_DB_{HOST,PORT,USER,PASSWORD,NAME}`

**Settings overrides** — when any of these are set, `getSetting()` returns the env value instead of querying the DB. The integration appears pre-configured in the admin UI automatically. The mapping lives in `src/lib/encryption.ts` → `getEnvOverride()`.

```
# AI
REMACC_ANTHROPIC_ENABLED        → anthropic_enabled  (true/false, default true)
REMACC_ANTHROPIC_API_KEY        → anthropic_apiKey
REMACC_ANTHROPIC_MODEL          → anthropic_model
REMACC_OPENAI_ENABLED           → openai_enabled     (true/false, default true)
REMACC_OPENAI_API_KEY           → openai_apiKey
REMACC_OPENAI_MODEL             → openai_model

# Email / SMTP
REMACC_SMTP_ENABLED             → smtp_enabled       (true/false, default true)
REMACC_SMTP_HOST                → smtp_host
REMACC_SMTP_PORT                → smtp_port
REMACC_SMTP_SSL                 → smtp_ssl           (true/false)
REMACC_SMTP_USER                → smtp_user
REMACC_SMTP_PASSWORD            → smtp_password
REMACC_SMTP_FROM_NAME           → smtp_fromName
REMACC_SMTP_FROM_EMAIL          → smtp_fromEmail

# Microsoft 365
REMACC_M365_ENABLED             → m365_enabled       (true/false, default true)
REMACC_M365_CLIENT_ID           → m365_clientId
REMACC_M365_CLIENT_SECRET       → m365_clientSecret
REMACC_M365_TENANT_ID           → m365_tenantId
REMACC_M365_EXPIRY_DATE         → m365_expiryDate    (ISO date, e.g. 2026-12-31)
REMACC_M365_REMINDER_DAYS       → m365_reminderDays  (default 30)

# Stripe
REMACC_STRIPE_ENABLED           → stripe_enabled     (true/false, default true)
REMACC_STRIPE_LIVE_MODE         → stripe_liveMode    (true/false)
REMACC_STRIPE_PUBLISHABLE_KEY   → stripe_publishableKey
REMACC_STRIPE_SECRET_KEY        → stripe_secretKey
REMACC_STRIPE_WEBHOOK_SECRET    → stripe_webhookSecret

# PayPal
REMACC_PAYPAL_ENABLED           → paypal_enabled     (true/false)
REMACC_PAYPAL_LIVE_MODE         → paypal_liveMode    (true/false)
REMACC_PAYPAL_CLIENT_ID         → paypal_clientId
REMACC_PAYPAL_CLIENT_SECRET     → paypal_clientSecret

# Viva Wallet
REMACC_VIVA_ENABLED             → vivawallet_enabled  (true/false)
REMACC_VIVA_LIVE_MODE           → vivawallet_liveMode (true/false)
REMACC_VIVA_CLIENT_ID           → vivawallet_clientId
REMACC_VIVA_CLIENT_SECRET       → vivawallet_clientSecret
REMACC_VIVA_MERCHANT_ID         → vivawallet_merchantId
```

## Database

MySQL + Drizzle ORM. Table prefix: `webapp_`. Auto-migrated on startup. AES-256-GCM encryption for all settings stored in `webapp_settings`.

## Versioning

`version.json` is the source of truth. `package.json` and `package-lock.json` must match. Bump all three on every push. `version.json` must stay in the `build-app` Next.js cache key in `build.yml`.

## UltraVNC DSM Proxy (server.js)

Viewer args are fixed: `-dsmplugin <plugin> -notoolbar -directx -autoscaling` (+ `-password`, `-user`). `-directx` is mandatory under Wine (GDI path livelocks in `WM_SIZE`); never `-fullscreen`. No xdotool/dialog automation — the status window closes itself once the viewer window is created. Never guess UltraVNC registry keys or window titles; verify against the UltraVNC source first.

## MCP GitHub Tools (vs curl)

Always prefer `mcp__github__*` tools over curl for GitHub API calls — the MCP server is not subject to CCR proxy restrictions. Use curl only for GHCR registry API (`ghcr.io/v2/...`) or non-Actions GitHub REST reads.
