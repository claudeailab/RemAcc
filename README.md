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

```yaml
services:

  app:
    image: ghcr.io/claudeailab/webapp
    container_name: app
    hostname: app
    restart: unless-stopped
    user: "0"
    environment:
      TZ: UTC
      WEBAPP_JWT_SECRET: change-me
      WEBAPP_ENCRYPTION_KEY: 0000000000000000000000000000000000000000000000000000000000000000
      WEBAPP_ADMIN_JWT_SECRET: change-me
      WEBAPP_ADMIN_EMAIL: admin@example.com
      WEBAPP_ADMIN_PASSWORD: change-me
      WEBAPP_DB_HOST: db
      WEBAPP_DB_PORT: 3306
      WEBAPP_DB_USER: app
      WEBAPP_DB_PASSWORD: change-me
      WEBAPP_DB_NAME: app
    ports:
      - 8095:8095
    volumes:
      - ./config/app/data:/data
    healthcheck:
      test: ["CMD", "wget", "-qO", "/dev/null", "http://localhost:8095/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    # depends_on:
    #   db:
    #     condition: service_healthy

networks:
  default:
    name: app
```

> **Generate a valid encryption key:** `openssl rand -hex 32`

---

## Updating

```bash
docker compose pull && docker compose up -d
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `TZ` | Timezone (e.g. `UTC`) |
| `WEBAPP_JWT_SECRET` | Session signing secret |
| `WEBAPP_ADMIN_JWT_SECRET` | Admin JWT signing secret |
| `WEBAPP_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM settings encryption |
| `WEBAPP_ADMIN_EMAIL` | Seeds first admin user on first login |
| `WEBAPP_ADMIN_PASSWORD` | Seeds first admin password on first login |
| `WEBAPP_DB_HOST` | MySQL host |
| `WEBAPP_DB_PORT` | MySQL port (default: `3306`) |
| `WEBAPP_DB_USER` | MySQL user |
| `WEBAPP_DB_PASSWORD` | MySQL password |
| `WEBAPP_DB_NAME` | MySQL database name |
| `WEBAPP_M365_ENABLED` | Set `true` to enable M365 startup health check |
| `WEBAPP_SMTP_ENABLED` | Set `true` to enable SMTP startup health check |
| `WEBAPP_ANTHROPIC_ENABLED` | Set `true` to enable Anthropic startup health check |
| `WEBAPP_OPENAI_ENABLED` | Set `true` to enable OpenAI startup health check |
| `WEBAPP_STRIPE_ENABLED` | Set `true` to enable Stripe startup health check |

---

## Tech Stack

- **Framework:** Next.js (App Router, standalone), TypeScript, React 19
- **Styling:** TailwindCSS 4, shadcn/ui, Radix UI primitives
- **Database:** MySQL + Drizzle ORM
- **Auth:** bcrypt, custom session tokens, MSAL (Azure AD)
- **AI:** @anthropic-ai/sdk, openai
- **Payments:** Stripe, PayPal, Viva Wallet
- **Email:** nodemailer
- **M365:** @azure/msal-node, @microsoft/microsoft-graph-client
- **Validation:** Zod
- **Containerisation:** Docker (node:22-alpine, multi-arch)
