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

Viewer args are fixed: `-dsmplugin <plugin> -notoolbar -directx -noremotecursor -noemulate3 -quality 3` (+ `-password`, `-user`). `-quality 3`: Ultra2 JPEG 30 instead of the command-line default 80 — measured −57% bytes per screen change, text still sharp; 2 smudges text; Tight/ZRLE/ZYWRLE were larger or unstable against UltraVNC server. No `-autoscaling`: the relay Xvfb is 7680x2160, the viewer draws the remote 1:1, `findViewerWindow` (`xwininfo`, from `x11-utils` in the Dockerfile) reads the viewer window's exact geometry and x11vnc exports only that rectangle (`-clip`), so guacd receives the remote at native size. A dialog without a main window for 3 s (e.g. "password check failed") is exported as a 1920x1080 area around it. `-noemulate3`: UltraVNC holds left/right presses on a `WM_TIMER` for middle-button emulation; timers are the lowest-priority message and can starve on a busy UI thread. `-directx` is mandatory under Wine (GDI path livelocks in `WM_SIZE`); never `-fullscreen`. No xdotool/dialog automation — the status window closes itself once the viewer window is created. Never guess UltraVNC registry keys or window titles; verify against the UltraVNC source first.

Relay x11vnc: `-wait 1 -defer 1 -nocursor` with XDAMAGE (no `-noxdamage`). Wine prefix: `Direct3D\renderer=gdi` set headless in `ensureWinePrefix`. guacd gets `cursor: 'local'` for DSM sessions.

Session lifecycle: a relay belongs to exactly one WebSocket — start only if the socket is open, stop if it closed during startup, stop on its `close`. One relay per connection id (newest wins; the older socket is closed). Displays come from `allocDisplay()` (synchronous reservation) and are released with their lock/socket files. Every change here must be verified with the E2E harness in `references/steps.md` (processes and `/tmp/.X*-lock` must be 0 after sessions end).

Service worker: reload on `controllerchange` only when the page already had a controller — a first claim must not reload (it reopens remote sessions).

Logging: never log per browser message on the relay hot path (stdout to a pipe is synchronous in Node); guacd runs at `-L info`. Each DSM session logs one line per 10 s (`DSM id=N: frames/s, browser round trip p50/max, CPU% viewer/x11vnc/Xvfb, load, VNC server link rtt, in KB/s peak KB/s`) — round trip = guacd `sync` relayed → browser `sync` ack, i.e. network + browser; high CPU% = relay saturated; the link figures come from the kernel's view of the viewer's TCP socket to the UltraVNC server (`ss -tin`, `iproute2` in the Dockerfile). Each mouse/key press is traced for 6 s at 50 ms (one at a time): `viewer -> VNC server by +X ms; VNC server -> viewer <KB> +start..+end ms, …; relay -> browser +Y ms` — `lastsnd`/`lastrcv` give exact packet times. Reading it: late send = local input path; long burst at a low peak KB/s = bandwidth; late short burst = UltraVNC server reacts late; big gap from burst end to relay → browser = relay rendering.

UltraVNC viewer facts (verified in source, 1.8.2.4 and main): a command-line launch never applies the Auto quick-option (`HandleQuickOption` runs only from the connect dialog), so it uses Ultra2 (JPEG, quality 8 → 80) with `autoDetect` off; the viewer requests a full non-incremental update every 30 s (`m_fullupdate_timer`, hard-coded).

## Multi-monitor Sessions (dashboard GuacPanel)

The session toolbar (top-right of GuacPanel) always has `Ctrl+Alt+Del` when connected. Remote monitors are inferred as equal side-by-side screens: `monitorCount` picks the fewest `n` (1–4) with `width / n / height` in 1.2–1.85 (5:4 … 16:9); none → 1 (single ultrawide). When `n > 1` a `1 | 2 | … | All` toolbar crops the display to one monitor (CSS `left` offset + `clip-path`, pointer clamped to that monitor) and the choice is stored per connection in `localStorage` (`remacc_screen_<id>`, default screen 1). Same code for plain VNC and DSM, because the DSM relay exports the remote at native size.

## Admin UI

Folder edit/clone/delete live only on the Folders page (always visible, never hover-only); the Connections page folder tree is for navigation and drag-and-drop only. DSM connections carry a `DSM` badge next to the protocol badge. The version is rendered with `versionBadge` from `ui-conventions.ts` everywhere it appears. The signed-in user is shown with `components/UserIdentity.tsx` (initials avatar, display name, email underneath when it differs; full identity in the tooltip) in the dashboard header left of Log out (`compact`: avatar only below `sm`) and in the admin sidebar and mobile drawer footers — never hand-rolled markup.

## MCP GitHub Tools (vs curl)

Always prefer `mcp__github__*` tools over curl for GitHub API calls — the MCP server is not subject to CCR proxy restrictions. Use curl only for GHCR registry API (`ghcr.io/v2/...`) or non-Actions GitHub REST reads.

## Credential Resolution

Connection's own credential, else nearest folder ancestor with a credential. Ids that no longer exist in `credentials` are skipped, never terminal. Server (`/api/connections/[id]/connect`) and admin UI (`resolveCredential`) must stay identical.

## Connection Errors (RDP/VNC)

`GuacPanel` keeps the first error (`setErrorMsg(prev => prev || …)`): the socket closing after a guacd `error` must not replace it with a generic tunnel message. guacd sends only "Aborted. See logs." for upstream failures, so `guacErrorText` maps the status code (`GUAC_STATUS_TEXT`, e.g. 519 = refused/unreachable). `server.js` forwards guacd `error` instructions also during the handshake, logs them with the user (`user=` from the connect API), and logs when guacd closes the connection. Server-generated errors carry a real message and status code (`Access denied (403)` = 769), never code 0.

## Azure AD Sign-in

`/login` shows "Sign in with Microsoft" (link to `/api/auth/azure`, no username) only when `/api/platform` returns `azureLogin: true` = M365 enabled (`m365_enabled` ≠ "false") and client id, secret and tenant all set. `/api/o365/callback` matches the id token's `oid` to `users.azureOid` and refuses unknown (`not_provisioned`), disabled (`disabled`) and group-less/permission-less users before creating a session. Typing an Azure user's username in the form still redirects to the same flow with `login_hint`.

## Web Connections

A web connection opens its URL (`http://` prefixed when the host has no scheme) in a new browser tab via `window.open(url, "_blank", "noopener")`, called synchronously in the click handler so popup blockers allow it. It is never a dashboard session and never proxied or rendered server-side: the user's own browser reaches the site. Don't reintroduce a rewriting reverse proxy (breaks on JS-built URLs, redirects, frame-busting, cookies, CSP), an iframe of the raw URL (blocked by Private Network Access and `X-Frame-Options`) or a server-side browser (~250 MB RAM per session, ~400 MB image) — all were tried and rejected. Session restore drops stored `web` sessions from older versions.

## UltraVNC Monitor Switch (DSM)

After `ready` on a DSM session, `server.js` asks the viewer for the remote's monitor count (`uvnc-switch.exe <exeName> count`: `WM_COPYDATA` dwData=1 to `VNCMDI_Window`, the viewer replies with `nbrMonitors`, filled by the server's `rfbMonitorInfo` 252 message, sent right after the viewer's SetEncodings; polled up to 5 s) and sends the custom Guacamole instruction `remacc-monitor-switch` only when it is 2+ — or 0 (server too old to report; the button is offered rather than hide a working feature). GuacPanel wraps `tunnel.oninstruction` (set in the `Guacamole.Client` constructor) to catch it and shows a `Switch screen` button, which sends the same instruction back. `handleGuac` intercepts it (never forwarded to guacd) and runs `uvnc-switch.exe <exeName> switch` (`WM_SYSCOMMAND ID_DESKTOP` 50111, exactly what the viewer's own toolbar button does). The relay follows the viewer window for the whole session (`followViewerWindow`, 1 s, stable for two reads → `x11vnc -remote clip:`), never a fixed wait after a switch — a slow remote would otherwise leave the relay clipped to the old size, which shows only the primary monitor. Each DSM viewer runs from its own **copy** `remacc-viewer-<display>.exe` (never a hard link: Wine reports every link of one file under the first name it opened, so the helper would hit another session). Session buttons (`Ctrl+Alt+Del`, `Switch screen`) stack vertically top-right. Plain VNC (guacd) sessions cannot send UltraVNC's `rfbSetSW`, so they get no switch button.
