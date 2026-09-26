# Platform

A production-ready Next.js SaaS foundation with admin panel, multi-provider auth, user management, AI integrations, payments, M365 SSO, SMTP, and PWA support. Built to deploy and extend.

## Features

### Auth & Users
- Local email/password auth (bcrypt, session tokens)
- Azure AD / Microsoft 365 SSO (MSAL + Microsoft Graph)
- Permission groups with granular access control
- Auto-seeds first admin from environment variables
- In-memory rate limiting on login

### Admin Panel
- Sidebar navigation with feature-flag gating
- User management: create, edit, delete, assign groups
- Azure AD directory browser + bulk sync
- Permission group editor with JSON-array permissions
- Audit log with paginated history (every login, create, update, delete)
- Full platform branding: name, title, icon (Iconify), primary color (live preview)
- Light / dark / system theme switcher

### AI
- Anthropic (Claude) API key + model configuration
- OpenAI API key + model configuration
- Connection test from admin UI

### Payments
- Stripe: secret key, public key, webhook secret, subscription plan editor
- PayPal: client ID + secret, sandbox/live toggle
- Viva Wallet: merchant ID + API key
- All tested directly from admin UI

### Email (SMTP)
- Host, port, user, password, from address
- Test email from admin UI

### M365 / Azure AD
- Client ID, client secret, tenant ID + secret expiry tracking
- Full user sync (bulk upsert from Azure directory)
- Connection test from admin UI

### Subscriptions & Plans
- Plan editor: name, monthly/yearly price, feature list
- Stripe price ID linkage per plan (monthly + yearly)
- Active/inactive toggle

### Security
- AES-256-GCM encryption for all settings stored in database
- Zod input validation on all API routes
- Drizzle query builder only (no raw SQL concatenation)
- HTTP security headers: `X-Frame-Options`, `X-Content-Type-Options`, `CSP`, `Referrer-Policy`, `Permissions-Policy`
- No `NEXT_PUBLIC_*` env vars — all secrets server-side only
- Container runs as non-root user

### Infrastructure
- PWA: service worker + dynamic manifest
- Startup health checks with ASCII status table
- Multi-arch Docker image (amd64 + arm64)
- Database auto-migration on startup (no manual step)

---

## Getting Started

Add the service to your `docker-compose.yml` and define the variables in a `.env` file alongside it.

```yaml
services:
  webapp:
    image: ghcr.io/claudeailab/wetman
    container_name: webapp
    hostname: webapp
    restart: unless-stopped
    user: "0"
    environment:
      TZ: ${TZ}

      REMACC_JWT_SECRET: ${REMACC_JWT_SECRET}
      REMACC_ENCRYPTION_KEY: ${REMACC_ENCRYPTION_KEY}
      REMACC_ADMIN_JWT_SECRET: ${REMACC_ADMIN_JWT_SECRET}

      REMACC_ADMIN_USERNAME: ${REMACC_ADMIN_USERNAME}
      REMACC_ADMIN_PASSWORD: ${REMACC_ADMIN_PASSWORD}

      REMACC_DB_HOST: ${REMACC_DB_HOST}
      REMACC_DB_PORT: ${REMACC_DB_PORT}
      REMACC_DB_USER: ${REMACC_DB_USER}
      REMACC_DB_NAME: ${REMACC_DB_NAME}
      REMACC_DB_PASSWORD: ${REMACC_DB_PASSWORD}

      REMACC_SMTP_ENABLED: ${REMACC_SMTP_ENABLED}
      REMACC_SMTP_SSL: ${REMACC_SMTP_SSL}
      REMACC_SMTP_HOST: ${REMACC_SMTP_HOST}
      REMACC_SMTP_PORT: ${REMACC_SMTP_PORT}
      REMACC_SMTP_USER: ${REMACC_SMTP_USER}
      REMACC_SMTP_PASSWORD: ${REMACC_SMTP_PASSWORD}
      REMACC_SMTP_FROM_NAME: ${REMACC_SMTP_FROM_NAME}
      REMACC_SMTP_FROM_EMAIL: ${REMACC_SMTP_FROM_EMAIL}

      REMACC_M365_ENABLED: ${REMACC_M365_ENABLED}
      REMACC_M365_CLIENT_ID: ${REMACC_M365_CLIENT_ID}
      REMACC_M365_TENANT_ID: ${REMACC_M365_TENANT_ID}
      REMACC_M365_CLIENT_SECRET: ${REMACC_M365_CLIENT_SECRET}
      REMACC_M365_EXPIRY_DATE: ${REMACC_M365_EXPIRY_DATE}
      REMACC_M365_REMINDER_DAYS: ${REMACC_M365_REMINDER_DAYS}

      REMACC_STRIPE_ENABLED: ${REMACC_STRIPE_ENABLED}
      REMACC_STRIPE_LIVE_MODE: ${REMACC_STRIPE_LIVE_MODE}
      REMACC_STRIPE_PUBLISHABLE_KEY: ${REMACC_STRIPE_PUBLISHABLE_KEY}
      REMACC_STRIPE_SECRET_KEY: ${REMACC_STRIPE_SECRET_KEY}
      REMACC_STRIPE_WEBHOOK_SECRET: ${REMACC_STRIPE_WEBHOOK_SECRET}

      REMACC_ANTHROPIC_ENABLED: ${REMACC_ANTHROPIC_ENABLED}
      REMACC_ANTHROPIC_MODEL: ${REMACC_ANTHROPIC_MODEL}
      REMACC_ANTHROPIC_API_KEY: ${REMACC_ANTHROPIC_API_KEY}

      REMACC_OPENAI_ENABLED: ${REMACC_OPENAI_ENABLED}
      REMACC_OPENAI_MODEL: ${REMACC_OPENAI_MODEL}
      REMACC_OPENAI_API_KEY: ${REMACC_OPENAI_API_KEY}
    ports:
      - 8020:8020
    volumes:
      - ./config/webapp/data:/data
    networks:
      - network
    depends_on:
      mysql:
        condition: service_healthy
    healthcheck:
      test:
        - CMD
        - wget
        - -qO
        - /dev/null
        - http://127.0.0.1:8020/api/health
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
```

---

## Updating

```bash
docker compose pull && docker compose up -d
```

---

## Environment Variables

Setting any of these env vars pre-configures that integration in the admin UI — no manual entry needed. The env value always takes precedence over anything saved in the database. Configured secrets show a prominent **Configured** badge inside the field in the UI.

| Variable | Description |
|---|---|
| `TZ` | Timezone (e.g. `UTC`) |
| `REMACC_JWT_SECRET` | Session signing secret |
| `REMACC_ADMIN_JWT_SECRET` | Admin JWT signing secret |
| `REMACC_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM settings encryption |
| `REMACC_ADMIN_USERNAME` | Seeds first admin user on first boot (used as login username) |
| `REMACC_ADMIN_PASSWORD` | Seeds first admin password on first boot |
| `REMACC_DB_HOST` | MySQL host |
| `REMACC_DB_PORT` | MySQL port (default: `3306`) |
| `REMACC_DB_USER` | MySQL user |
| `REMACC_DB_PASSWORD` | MySQL password |
| `REMACC_DB_NAME` | MySQL database name |
| `REMACC_ANTHROPIC_ENABLED` | Enable Anthropic (`true`/`false`, default `true`) |
| `REMACC_ANTHROPIC_API_KEY` | Anthropic API key |
| `REMACC_ANTHROPIC_MODEL` | Anthropic model (default: `claude-sonnet-4-6`) |
| `REMACC_OPENAI_ENABLED` | Enable OpenAI (`true`/`false`, default `true`) |
| `REMACC_OPENAI_API_KEY` | OpenAI API key |
| `REMACC_OPENAI_MODEL` | OpenAI model (default: `gpt-4o`) |
| `REMACC_SMTP_ENABLED` | Enable SMTP email (`true`/`false`, default `true`) |
| `REMACC_SMTP_HOST` | SMTP hostname |
| `REMACC_SMTP_PORT` | SMTP port |
| `REMACC_SMTP_SSL` | SMTP TLS (`true`/`false`) |
| `REMACC_SMTP_USER` | SMTP username |
| `REMACC_SMTP_PASSWORD` | SMTP password |
| `REMACC_SMTP_FROM_NAME` | Sender display name |
| `REMACC_SMTP_FROM_EMAIL` | Sender email address |
| `REMACC_M365_ENABLED` | Enable Microsoft 365 (`true`/`false`, default `true`) |
| `REMACC_M365_CLIENT_ID` | Azure app client ID |
| `REMACC_M365_CLIENT_SECRET` | Azure app client secret |
| `REMACC_M365_TENANT_ID` | Azure tenant ID |
| `REMACC_M365_EXPIRY_DATE` | Secret expiry date (ISO, e.g. `"2027-01-01"`) |
| `REMACC_M365_REMINDER_DAYS` | Days before expiry to remind (default: `30`) |
| `REMACC_STRIPE_ENABLED` | Enable Stripe (`true`/`false`, default `true`) |
| `REMACC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `REMACC_STRIPE_SECRET_KEY` | Stripe secret key |
| `REMACC_STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `REMACC_STRIPE_LIVE_MODE` | Stripe live mode (`true`/`false`) |
| `REMACC_PAYPAL_ENABLED` | Enable PayPal (`true`/`false`) |
| `REMACC_PAYPAL_CLIENT_ID` | PayPal client ID |
| `REMACC_PAYPAL_CLIENT_SECRET` | PayPal client secret |
| `REMACC_PAYPAL_LIVE_MODE` | PayPal live mode (`true`/`false`) |
| `REMACC_VIVA_ENABLED` | Enable Viva Wallet (`true`/`false`) |
| `REMACC_VIVA_CLIENT_ID` | Viva Wallet client ID |
| `REMACC_VIVA_CLIENT_SECRET` | Viva Wallet client secret |
| `REMACC_VIVA_MERCHANT_ID` | Viva Wallet merchant ID |
| `REMACC_VIVA_LIVE_MODE` | Viva Wallet live mode (`true`/`false`) |
