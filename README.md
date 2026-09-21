# Platform

A production-ready Next.js webapp with admin area, user management, M365 integration, SMTP, AI providers (Anthropic + OpenAI), Stripe subscriptions, and PWA support.

## Features

- Admin dashboard with sidebar navigation
- M365 / Azure AD integration with user sync
- SMTP email configuration and test
- Anthropic and OpenAI API management
- Stripe payments and subscription plan editor
- User management (local + Azure AD)
- PWA support (offline-capable, installable)
- Startup health checks with ASCII status table
- JWT sessions, bcrypt passwords, AES-256-GCM encrypted settings

## Getting Started

```yaml
services:

  app:
    image: ghcr.io/claudeailab/remotecat
    container_name: app
    hostname: app
    restart: unless-stopped
    user: "0"
    environment:
      TZ: UTC
      REMOTE_CAT_JWT_SECRET: change-me
      REMOTE_CAT_ENCRYPTION_KEY: 0000000000000000000000000000000000000000000000000000000000000000
      REMOTE_CAT_ADMIN_JWT_SECRET: change-me
      REMOTE_CAT_ADMIN_EMAIL: admin@example.com
      REMOTE_CAT_ADMIN_PASSWORD: change-me
      REMOTE_CAT_DB_HOST: db
      REMOTE_CAT_DB_PORT: 3306
      REMOTE_CAT_DB_USER: app
      REMOTE_CAT_DB_PASSWORD: change-me
      REMOTE_CAT_DB_NAME: app
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

## Updating

```bash
docker compose pull && docker compose up -d
```

## Environment Variables

| Variable | Description |
|---|---|
| `TZ` | Timezone (e.g. `UTC`) |
| `REMOTE_CAT_JWT_SECRET` | Session JWT signing secret |
| `REMOTE_CAT_ADMIN_JWT_SECRET` | Admin JWT signing secret |
| `REMOTE_CAT_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM settings encryption |
| `REMOTE_CAT_ADMIN_EMAIL` | Seeds first admin user on first login |
| `REMOTE_CAT_ADMIN_PASSWORD` | Seeds first admin password on first login |
| `REMOTE_CAT_DB_HOST` | MySQL host |
| `REMOTE_CAT_DB_PORT` | MySQL port (default: 3306) |
| `REMOTE_CAT_DB_USER` | MySQL user |
| `REMOTE_CAT_DB_PASSWORD` | MySQL password |
| `REMOTE_CAT_DB_NAME` | MySQL database name |
| `REMOTE_CAT_M365_ENABLED` | Enable M365 startup health check |
| `REMOTE_CAT_SMTP_ENABLED` | Enable SMTP startup health check |
| `REMOTE_CAT_ANTHROPIC_ENABLED` | Enable Anthropic startup health check |
| `REMOTE_CAT_OPENAI_ENABLED` | Enable OpenAI startup health check |
| `REMOTE_CAT_STRIPE_ENABLED` | Enable Stripe startup health check |
