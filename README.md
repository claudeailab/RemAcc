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

      WETMAN_JWT_SECRET: ${WETMAN_JWT_SECRET}
      WETMAN_ENCRYPTION_KEY: ${WETMAN_ENCRYPTION_KEY}
      WETMAN_ADMIN_JWT_SECRET: ${WETMAN_ADMIN_JWT_SECRET}

      WETMAN_ADMIN_USERNAME: ${WETMAN_ADMIN_USERNAME}
      WETMAN_ADMIN_PASSWORD: ${WETMAN_ADMIN_PASSWORD}

      WETMAN_DB_HOST: ${WETMAN_DB_HOST}
      WETMAN_DB_PORT: ${WETMAN_DB_PORT}
      WETMAN_DB_USER: ${WETMAN_DB_USER}
      WETMAN_DB_NAME: ${WETMAN_DB_NAME}
      WETMAN_DB_PASSWORD: ${WETMAN_DB_PASSWORD}

      WETMAN_SMTP_ENABLED: ${WETMAN_SMTP_ENABLED}
      WETMAN_SMTP_SSL: ${WETMAN_SMTP_SSL}
      WETMAN_SMTP_HOST: ${WETMAN_SMTP_HOST}
      WETMAN_SMTP_PORT: ${WETMAN_SMTP_PORT}
      WETMAN_SMTP_USER: ${WETMAN_SMTP_USER}
      WETMAN_SMTP_PASSWORD: ${WETMAN_SMTP_PASSWORD}
      WETMAN_SMTP_FROM_NAME: ${WETMAN_SMTP_FROM_NAME}
      WETMAN_SMTP_FROM_EMAIL: ${WETMAN_SMTP_FROM_EMAIL}

      WETMAN_M365_ENABLED: ${WETMAN_M365_ENABLED}
      WETMAN_M365_CLIENT_ID: ${WETMAN_M365_CLIENT_ID}
      WETMAN_M365_TENANT_ID: ${WETMAN_M365_TENANT_ID}
      WETMAN_M365_CLIENT_SECRET: ${WETMAN_M365_CLIENT_SECRET}
      WETMAN_M365_EXPIRY_DATE: ${WETMAN_M365_EXPIRY_DATE}
      WETMAN_M365_REMINDER_DAYS: ${WETMAN_M365_REMINDER_DAYS}

      WETMAN_STRIPE_ENABLED: ${WETMAN_STRIPE_ENABLED}
      WETMAN_STRIPE_LIVE_MODE: ${WETMAN_STRIPE_LIVE_MODE}
      WETMAN_STRIPE_PUBLISHABLE_KEY: ${WETMAN_STRIPE_PUBLISHABLE_KEY}
      WETMAN_STRIPE_SECRET_KEY: ${WETMAN_STRIPE_SECRET_KEY}
      WETMAN_STRIPE_WEBHOOK_SECRET: ${WETMAN_STRIPE_WEBHOOK_SECRET}

      WETMAN_ANTHROPIC_ENABLED: ${WETMAN_ANTHROPIC_ENABLED}
      WETMAN_ANTHROPIC_MODEL: ${WETMAN_ANTHROPIC_MODEL}
      WETMAN_ANTHROPIC_API_KEY: ${WETMAN_ANTHROPIC_API_KEY}

      WETMAN_OPENAI_ENABLED: ${WETMAN_OPENAI_ENABLED}
      WETMAN_OPENAI_MODEL: ${WETMAN_OPENAI_MODEL}
      WETMAN_OPENAI_API_KEY: ${WETMAN_OPENAI_API_KEY}
    ports:
      - 8099:8099
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
        - http://127.0.0.1:8099/api/health
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
| `WETMAN_JWT_SECRET` | Session signing secret |
| `WETMAN_ADMIN_JWT_SECRET` | Admin JWT signing secret |
| `WETMAN_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM settings encryption |
| `WETMAN_ADMIN_USERNAME` | Seeds first admin user on first boot (used as login username) |
| `WETMAN_ADMIN_PASSWORD` | Seeds first admin password on first boot |
| `WETMAN_DB_HOST` | MySQL host |
| `WETMAN_DB_PORT` | MySQL port (default: `3306`) |
| `WETMAN_DB_USER` | MySQL user |
| `WETMAN_DB_PASSWORD` | MySQL password |
| `WETMAN_DB_NAME` | MySQL database name |
| `WETMAN_ANTHROPIC_ENABLED` | Enable Anthropic (`true`/`false`, default `true`) |
| `WETMAN_ANTHROPIC_API_KEY` | Anthropic API key |
| `WETMAN_ANTHROPIC_MODEL` | Anthropic model (default: `claude-sonnet-4-6`) |
| `WETMAN_OPENAI_ENABLED` | Enable OpenAI (`true`/`false`, default `true`) |
| `WETMAN_OPENAI_API_KEY` | OpenAI API key |
| `WETMAN_OPENAI_MODEL` | OpenAI model (default: `gpt-4o`) |
| `WETMAN_SMTP_ENABLED` | Enable SMTP email (`true`/`false`, default `true`) |
| `WETMAN_SMTP_HOST` | SMTP hostname |
| `WETMAN_SMTP_PORT` | SMTP port |
| `WETMAN_SMTP_SSL` | SMTP TLS (`true`/`false`) |
| `WETMAN_SMTP_USER` | SMTP username |
| `WETMAN_SMTP_PASSWORD` | SMTP password |
| `WETMAN_SMTP_FROM_NAME` | Sender display name |
| `WETMAN_SMTP_FROM_EMAIL` | Sender email address |
| `WETMAN_M365_ENABLED` | Enable Microsoft 365 (`true`/`false`, default `true`) |
| `WETMAN_M365_CLIENT_ID` | Azure app client ID |
| `WETMAN_M365_CLIENT_SECRET` | Azure app client secret |
| `WETMAN_M365_TENANT_ID` | Azure tenant ID |
| `WETMAN_M365_EXPIRY_DATE` | Secret expiry date (ISO, e.g. `"2027-01-01"`) |
| `WETMAN_M365_REMINDER_DAYS` | Days before expiry to remind (default: `30`) |
| `WETMAN_STRIPE_ENABLED` | Enable Stripe (`true`/`false`, default `true`) |
| `WETMAN_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `WETMAN_STRIPE_SECRET_KEY` | Stripe secret key |
| `WETMAN_STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `WETMAN_STRIPE_LIVE_MODE` | Stripe live mode (`true`/`false`) |
| `WETMAN_PAYPAL_ENABLED` | Enable PayPal (`true`/`false`) |
| `WETMAN_PAYPAL_CLIENT_ID` | PayPal client ID |
| `WETMAN_PAYPAL_CLIENT_SECRET` | PayPal client secret |
| `WETMAN_PAYPAL_LIVE_MODE` | PayPal live mode (`true`/`false`) |
| `WETMAN_VIVA_ENABLED` | Enable Viva Wallet (`true`/`false`) |
| `WETMAN_VIVA_CLIENT_ID` | Viva Wallet client ID |
| `WETMAN_VIVA_CLIENT_SECRET` | Viva Wallet client secret |
| `WETMAN_VIVA_MERCHANT_ID` | Viva Wallet merchant ID |
| `WETMAN_VIVA_LIVE_MODE` | Viva Wallet live mode (`true`/`false`) |
