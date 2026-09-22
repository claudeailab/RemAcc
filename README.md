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
  webapp:
    image: ghcr.io/claudeailab/webapp
    container_name: webapp
    hostname: webapp
    restart: unless-stopped
    user: "0"
    environment:
      TZ: ${TZ}

      WEBAPP_JWT_SECRET: ${WEBAPP_JWT_SECRET}
      WEBAPP_ENCRYPTION_KEY: ${WEBAPP_ENCRYPTION_KEY}
      WEBAPP_ADMIN_JWT_SECRET: ${WEBAPP_ADMIN_JWT_SECRET}

      WEBAPP_ADMIN_EMAIL: ${WEBAPP_ADMIN_EMAIL}
      WEBAPP_ADMIN_PASSWORD: ${WEBAPP_ADMIN_PASSWORD}

      WEBAPP_DB_HOST: ${WEBAPP_DB_HOST}
      WEBAPP_DB_PORT: ${WEBAPP_DB_PORT}
      WEBAPP_DB_USER: ${WEBAPP_DB_USER}
      WEBAPP_DB_NAME: ${WEBAPP_DB_NAME}
      WEBAPP_DB_PASSWORD: ${WEBAPP_DB_PASSWORD}

      WEBAPP_SMTP_ENABLED: ${WEBAPP_SMTP_ENABLED}
      WEBAPP_SMTP_SSL: ${WEBAPP_SMTP_SSL}
      WEBAPP_SMTP_HOST: ${WEBAPP_SMTP_HOST}
      WEBAPP_SMTP_PORT: ${WEBAPP_SMTP_PORT}
      WEBAPP_SMTP_USER: ${WEBAPP_SMTP_USER}
      WEBAPP_SMTP_PASSWORD: ${WEBAPP_SMTP_PASSWORD}
      WEBAPP_SMTP_FROM_NAME: ${WEBAPP_SMTP_FROM_NAME}
      WEBAPP_SMTP_FROM_EMAIL: ${WEBAPP_SMTP_FROM_EMAIL}

      WEBAPP_M365_ENABLED: ${WEBAPP_M365_ENABLED}
      WEBAPP_M365_CLIENT_ID: ${WEBAPP_M365_CLIENT_ID}
      WEBAPP_M365_TENANT_ID: ${WEBAPP_M365_TENANT_ID}
      WEBAPP_M365_CLIENT_SECRET: ${WEBAPP_M365_CLIENT_SECRET}
      WEBAPP_M365_EXPIRY_DATE: ${WEBAPP_M365_EXPIRY_DATE}
      WEBAPP_M365_REMINDER_DAYS: ${WEBAPP_M365_REMINDER_DAYS}

      WEBAPP_STRIPE_ENABLED: ${WEBAPP_STRIPE_ENABLED}
      WEBAPP_STRIPE_LIVE_MODE: ${WEBAPP_STRIPE_LIVE_MODE}
      WEBAPP_STRIPE_PUBLISHABLE_KEY: ${WEBAPP_STRIPE_PUBLISHABLE_KEY}
      WEBAPP_STRIPE_SECRET_KEY: ${WEBAPP_STRIPE_SECRET_KEY}
      WEBAPP_STRIPE_WEBHOOK_SECRET: ${WEBAPP_STRIPE_WEBHOOK_SECRET}

      WEBAPP_ANTHROPIC_ENABLED: ${WEBAPP_ANTHROPIC_ENABLED}
      WEBAPP_ANTHROPIC_MODEL: ${WEBAPP_ANTHROPIC_MODEL}
      WEBAPP_ANTHROPIC_API_KEY: ${WEBAPP_ANTHROPIC_API_KEY}

      WEBAPP_OPENAI_ENABLED: ${WEBAPP_OPENAI_ENABLED}
      WEBAPP_OPENAI_MODEL: ${WEBAPP_OPENAI_MODEL}
      WEBAPP_OPENAI_API_KEY: ${WEBAPP_OPENAI_API_KEY}
    ports:
      - 8095:8095
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
        - http://127.0.0.1:8095/api/health
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
| `WEBAPP_JWT_SECRET` | Session signing secret |
| `WEBAPP_ADMIN_JWT_SECRET` | Admin JWT signing secret |
| `WEBAPP_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM settings encryption |
| `WEBAPP_ADMIN_EMAIL` | Seeds first admin user on first boot |
| `WEBAPP_ADMIN_PASSWORD` | Seeds first admin password on first boot |
| `WEBAPP_DB_HOST` | MySQL host |
| `WEBAPP_DB_PORT` | MySQL port (default: `3306`) |
| `WEBAPP_DB_USER` | MySQL user |
| `WEBAPP_DB_PASSWORD` | MySQL password |
| `WEBAPP_DB_NAME` | MySQL database name |
| `WEBAPP_ANTHROPIC_ENABLED` | Enable Anthropic (`true`/`false`, default `true`) |
| `WEBAPP_ANTHROPIC_API_KEY` | Anthropic API key |
| `WEBAPP_ANTHROPIC_MODEL` | Anthropic model (default: `claude-sonnet-4-6`) |
| `WEBAPP_OPENAI_ENABLED` | Enable OpenAI (`true`/`false`, default `true`) |
| `WEBAPP_OPENAI_API_KEY` | OpenAI API key |
| `WEBAPP_OPENAI_MODEL` | OpenAI model (default: `gpt-4o`) |
| `WEBAPP_SMTP_ENABLED` | Enable SMTP email (`true`/`false`, default `true`) |
| `WEBAPP_SMTP_HOST` | SMTP hostname |
| `WEBAPP_SMTP_PORT` | SMTP port |
| `WEBAPP_SMTP_SSL` | SMTP TLS (`true`/`false`) |
| `WEBAPP_SMTP_USER` | SMTP username |
| `WEBAPP_SMTP_PASSWORD` | SMTP password |
| `WEBAPP_SMTP_FROM_NAME` | Sender display name |
| `WEBAPP_SMTP_FROM_EMAIL` | Sender email address |
| `WEBAPP_M365_ENABLED` | Enable Microsoft 365 (`true`/`false`, default `true`) |
| `WEBAPP_M365_CLIENT_ID` | Azure app client ID |
| `WEBAPP_M365_CLIENT_SECRET` | Azure app client secret |
| `WEBAPP_M365_TENANT_ID` | Azure tenant ID |
| `WEBAPP_M365_EXPIRY_DATE` | Secret expiry date (ISO, e.g. `"2027-01-01"`) |
| `WEBAPP_M365_REMINDER_DAYS` | Days before expiry to remind (default: `30`) |
| `WEBAPP_STRIPE_ENABLED` | Enable Stripe (`true`/`false`, default `true`) |
| `WEBAPP_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `WEBAPP_STRIPE_SECRET_KEY` | Stripe secret key |
| `WEBAPP_STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `WEBAPP_STRIPE_LIVE_MODE` | Stripe live mode (`true`/`false`) |
| `WEBAPP_PAYPAL_ENABLED` | Enable PayPal (`true`/`false`) |
| `WEBAPP_PAYPAL_CLIENT_ID` | PayPal client ID |
| `WEBAPP_PAYPAL_CLIENT_SECRET` | PayPal client secret |
| `WEBAPP_PAYPAL_LIVE_MODE` | PayPal live mode (`true`/`false`) |
| `WEBAPP_VIVA_ENABLED` | Enable Viva Wallet (`true`/`false`) |
| `WEBAPP_VIVA_CLIENT_ID` | Viva Wallet client ID |
| `WEBAPP_VIVA_CLIENT_SECRET` | Viva Wallet client secret |
| `WEBAPP_VIVA_MERCHANT_ID` | Viva Wallet merchant ID |
| `WEBAPP_VIVA_LIVE_MODE` | Viva Wallet live mode (`true`/`false`) |
