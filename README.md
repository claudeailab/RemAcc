# RemAcc

A self-hosted remote access platform. Connect to RDP, VNC, SSH, and internal web services from any browser — no client software, no VPN.

## Features

### Remote Access Protocols
- **RDP** — Remote Desktop sessions streamed to the browser via Apache Guacamole (FreeRDP). Supports NLA, clipboard, multi-monitor, wallpaper/font-smoothing settings.
- **VNC** — VNC sessions via guacd. Plain VNC or UltraVNC DSM-encrypted (plugin + viewer run server-side under Wine for full end-to-end encryption).
- **SSH** — Full xterm.js terminal over WebSocket. PuTTY-style right-click paste, 5000-line scrollback, keepalive pings.
- **Web** — Opens internal web services in a lightweight in-app browser (WebKitGTK, ~26 KB binary). Works outside the office network — the browser runs on the RemAcc server, inside the company network, and streams to the user like any other session.

### Auto Sign-in
- Credentials can be assigned per connection or inherited from a parent folder.
- HTTP Basic/Digest/NTLM challenges are answered automatically on the configured host.
- Login forms are detected, filled, and submitted — in an isolated script world the page cannot read.
- Max 2 automatic submits per session to prevent lockout on wrong passwords.

### Folder Hierarchy
- Connections are organized in a collapsible, nestable folder tree.
- Credentials, and future per-folder settings, cascade down to all connections in a folder unless overridden at the connection level.
- Folders and connections can be drag-and-drop reordered and reparented.

### Multi-session Dashboard
- Open multiple connections simultaneously as tabs.
- Tabs persist across page refreshes.
- Resizable sidebar collapses to a menu button on mobile.
- Live search by connection name or hostname.
- Active session indicator (green dot) per connection.

### Multi-monitor Support
- Automatically detects side-by-side monitor layout from aspect ratio.
- Screen switcher (1 / 2 / All) overlays the session toolbar when multiple monitors are detected.

### Session Grace Period
- Configurable reconnect window (0–300 s). If a browser disconnects and reconnects within that window, the session resumes without re-authenticating or restarting the remote session.
- SSH sessions buffer up to 64 KB of output during the grace window so no terminal output is lost.

### Credential Store
- Named credentials with username, password, optional Windows domain, and notes.
- Passwords stored AES-256-GCM encrypted; never pre-loaded in forms — revealed only on demand.

### Bulk Import / Export
- Import connections from an `.xlsx` spreadsheet (RDP, VNC, SSH, Web, UltraVNC).
- Export all connections as `.xlsx` (name, type, host, folder path, notes).

### User Management
- Local email/password accounts (bcrypt).
- Azure AD / Microsoft 365 SSO via MSAL + Microsoft Graph OAuth2.
- Azure AD directory browser: pick individual users or bulk-sync the entire directory.
- Permission groups with JSON-array granular permission lists.

### Admin Panel
- Full CRUD for connections, folders, credentials, users, and groups.
- Audit log: every login, create, update, and delete with user, IP, timestamp, and structured diff.
- Protocol settings: per-protocol defaults for RDP, VNC, SSH, and UltraVNC DSM file uploads.
- Platform branding: name, page title, icon (Iconify picker), primary color (live preview), light/dark/system theme.
- SMTP email, Stripe/PayPal/Viva Wallet payments, Anthropic/OpenAI AI keys — all testable directly from the admin UI.
- PWA push notifications with per-device management.

### Security
- AES-256-GCM encryption for all secrets stored in the database.
- Zod input validation on all API routes; Drizzle ORM only (no raw SQL).
- HTTP security headers: `X-Frame-Options`, `X-Content-Type-Options`, CSP, `Referrer-Policy`, `Permissions-Policy`.
- No `NEXT_PUBLIC_*` env vars — all secrets server-side only.
- Container runs as non-root.

---

## Getting Started

Add the service to your `docker-compose.yml` and define the variables in a `.env` file alongside it.

```yaml
services:
  webapp:
    image: ghcr.io/claudeailab/remacc
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
