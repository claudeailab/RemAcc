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

Connection's own credential, else nearest folder ancestor with a credential — for every protocol, web included. Ids that no longer exist in `credentials` are skipped, never terminal. Server (`/api/connections/[id]/connect`) and admin UI (`resolveCredential`) must stay identical.

## Connection Errors (RDP/VNC)

`GuacPanel` keeps the first error (`setErrorMsg(prev => prev || …)`): the socket closing after a guacd `error` must not replace it with a generic tunnel message. guacd sends only "Aborted. See logs." for upstream failures, so `guacErrorText` maps the status code (`GUAC_STATUS_TEXT`, e.g. 519 = refused/unreachable). `server.js` forwards guacd `error` instructions also during the handshake, logs them with the user (`user=` from the connect API), and logs when guacd closes the connection. Server-generated errors carry a real message and status code (`Access denied (403)` = 769), never code 0.

## Azure AD Sign-in

`/login` shows "Sign in with Microsoft" (link to `/api/auth/azure`, no username) only when `/api/platform` returns `azureLogin: true` = M365 enabled (`m365_enabled` ≠ "false") and client id, secret and tenant all set. `/api/o365/callback` matches the id token's `oid` to `users.azureOid` and refuses unknown (`not_provisioned`), disabled (`disabled`) and group-less/permission-less users before creating a session. Typing an Azure user's username in the form still redirects to the same flow with `login_hint`.

## Web Connections

Rendered inside RemAcc by a server-side browser on the company network, never `window.open` (internal IPs are unreachable from outside), an iframe or a rewriting reverse proxy (breaks on JS-built URLs, root-relative paths that collide with RemAcc routes, redirects, cookies, CSP). The browser is `tools/remacc-browser.c`: a ~26 KB C launcher on WebKitGTK 4.1 (Ubuntu `libwebkit2gtk-4.1-0`, security-updated), compiled in the Dockerfile `browser` stage. Chosen as the smallest maintained engine that runs modern JavaScript: +251 MB image layer and ~190 MB PSS per session, vs Chromium's 597 MB binary and 314 MB PSS on the same page. Don't switch to `surf` (unmaintained since 2022), NetSurf/Dillo (no JavaScript) or Chromium (size and RAM, rejected). The runtime layer installs only `libwebkit2gtk-4.1-0` + `dbus-x11` (stands in for the systemd session-bus dependency) with `dpkg path-exclude` for icon themes (keep `Adwaita/index.theme`, `cursor.theme`, `cursors/` or `adwaita-icon-theme`'s postinst fails), docs, man pages and translations.

`GuacPanel` opens `/ws/web/{id}?w=&h=` (panel size, clamped 640–3840 × 480–2160); `handleGuac` checks the connection really is `web` (and `/ws/rdp|vnc` refuse `web` connections), then `startWebBrowser` (server.js) starts Xvfb at that size, the browser and x11vnc `-noprimary`; guacd connects with `select vnc`, `cursor: local`. One browser per WebSocket, stopped when the socket closes, never parked. Processes are spawned `detached` and killed by process group (WebKit's network/web processes share it). Browser env is only `DISPLAY HOME PATH LANG NO_AT_BRIDGE=1 GSETTINGS_BACKEND=memory DBUS_SESSION_BUS_ADDRESS=disabled: WEBKIT_SKIA_ENABLE_CPU_RENDERING=1 WEBKIT_DISABLE_DMABUF_RENDERER=1` (never RemAcc's secrets); the last two cut ~30 MB per session.

The launcher reads `url\0username\0password\0` from stdin (never argv/env), uses an ephemeral data manager (nothing on disk), ignores TLS errors (self-signed internal sites), allows only `http https about data blob` navigations (no `file://`), cancels downloads and non-displayable responses, opens popups/`target=_blank` in the same view, ignores `window.close()`, reloads after a web-process crash. Keys: Alt+Left/Right back/forward, F5/Ctrl+R reload, Alt+Home home — the web toolbar (Back, Forward, Reload, Home, URL) above the canvas sends exactly these; no overlay buttons on web sessions (they would cover the site's own top-right menus).

**Auto sign-in** uses the resolved credential exactly like the other protocols (own, else inherited from the folder chain; user decision, v0.1.133). HTTP Basic/Digest/NTLM: answered via WebKit's `authenticate` signal on the configured host, once (a retry falls back to WebKit's dialog). Forms: a user script in an isolated world (`remacc`; page JS cannot read it), allow-listed to `http(s)://{configured host}/*` (any port), injected into all frames at document end and re-run on DOM changes: fills the last visible text/email/tel input before the visible password field (skipping `autocomplete=new-password`) plus the password, only if empty, firing `input`/`change` (works with React/Vue state); with no password field, fills a username-looking field (two-step logins). Then clicks the form's submit button, else a visible Login/Sign in/Next/Continue/OK button, else `requestSubmit()`, else Enter. At most 2 automatic submits per session (username step + password step); afterwards fields are still filled but never submitted, so a wrong password can't lock the account.

## UltraVNC Monitors (DSM)

There is no "Switch screen" button: the server always asks the remote for all screens side by side, and the browser's `1 | 2 | All` bar (client-side crop, `monitorCount` = fewest equal side-by-side monitors with a real monitor's aspect ratio) picks the screen instantly. **Before the relay starts** (`startDsmProxy` -> `prepareDsmMonitors`, after the viewer window is up and before x11vnc/guacd), so the browser's first picture already shows all screens — never one screen and then a re-layout. It asks the viewer for the remote's monitor count (`uvnc-switch.exe <exeName> count`: `WM_COPYDATA` dwData=1 to `VNCMDI_Window`, the viewer replies with `nbrMonitors`, filled by the server's `rfbMonitorInfo` 252 message, sent right after the viewer's SetEncodings — poll every 250 ms for at most 1.5 s). Unless it is exactly 1 (0 = too old to report, null = helper could not ask: still try), `keepAllDsmMonitors` waits until the viewer window kept its size for 1 s (`waitForStableWindow`, max 4 s), then `showAllDsmMonitors` runs `uvnc-switch.exe <exeName> switch` (`WM_SYSCOMMAND ID_DESKTOP` 50111) one step at a time until the viewer window is wider than 1.85:1, logging `screen step N: WxH`; then the window must hold for 1 s more (the remote may still rebuild its desktop), else one more attempt. The cycle depends on the server version (2012–2016 winvnc: primary -> second -> all; 1.8.2.4: primary <-> all), so never send several switches blind. Each step waits up to 6 s for a new size: equal monitors keep the size between steps, but a wait shorter than a slow remote's answer makes the next step overshoot past all screens (v0.1.152's 3 s). At most N steps for N monitors, 3 when unknown. The prepare's attempts do not count toward the session's fallback budget. While the relay starts, `handleGuac` sends a Guacamole `nop` to the browser every 5 s until guacd is `ready`: the browser tunnel closes after 15 s without data (`receiveTimeout`, "Server timeout"), and relay startup + monitor setup can take longer. UltraVNC returns to one monitor whenever it rebuilds its desktop (right after connect, lock/unlock, UAC, Ctrl+Alt+Del: `desktop switch` in its log), so `followViewerWindow` calls `keepAllDsmMonitors` whenever a settled view is not wide; it gives up on a remote that never shows a side-by-side view, or one that falls back 3 times within a minute. The relay follows the viewer window for the whole session (`followViewerWindow`, 500 ms, stable for two reads -> `applyClip` -> `x11vnc -sync -remote clip:`, a non-zero exit is logged), never a fixed wait. `handleGuac` logs `browser display now WxH` from guacd's layer-0 `size` instruction — the size the browser's bar is computed from; compare it with `remote screen now` when the bar is missing. Each DSM viewer runs from its own **copy** `remacc-viewer-<display>.exe` (never a hard link: Wine reports every link of one file under the first name it opened, so the helper would hit another session). Plain VNC (guacd) sessions cannot send UltraVNC's `rfbSetSW`; they show the bar only when the remote already sends a wide desktop.

## Protocol Settings

`src/lib/protocol-settings.ts` holds the RDP/VNC/SSH defaults and readers plus `getSessionGrace`. Admin routes `/api/admin/settings/{rdp,vnc,ssh,connections}` edit them; `/api/connections/settings` (any signed-in user) returns `{ rdp, vnc, ssh, sessionGrace }`. `server.js` reads that route **with the connecting user's cookie** (cached 30 s, `redirect: 'manual'`, failures logged) — never an admin route: `requireAdmin()` redirects a cookie-less request to `/login`, and the HTML parse failure used to be swallowed, so no setting ever applied. The SSH panel reads font family/size/scrollback from the same route. No per-protocol "default port": each connection stores its own.

## SSH Terminal Size

The browser fits xterm before connecting and opens `/ws/ssh/{id}?cols=&rows=`; `handleSSH` starts the shell at that size (clamped 20–1000 x 5–500), records any `resize` sent while SSH is still connecting, and the panel sends its size again on `onopen` (resizes sent before the socket opened are dropped). Never a fixed 80x24.

## Parked Sessions (grace period)

Keyed `{protocol}:{connectionId}:{user}` and resumed only **after** `/api/connections/{id}/connect` authorised the request — another user opening the same connection gets a new session, never someone else's.

## Wine Prefix (DSM viewers)

Built once in the image: `tools/wine-prefix-template.sh /opt/uvnc-wine-template` (Dockerfile, right after the apt layers so it caches) runs `wineboot -i` + the GDI renderer registry key, then replaces every prefix file byte-identical to Wine's own PE files (`/usr/lib/*-linux-gnu/wine/*-windows`) with a symlink: ~690 MB -> ~13 MB. Each step has a `timeout`; if the script fails the build continues without a template. At startup `ensureWinePrefix` copies the template to `/tmp/uvnc-wine` (`cp -r --no-dereference`, so the runtime user owns it — Wine refuses a prefix owned by another uid, root included; the image runs as `appuser`, compose may set `user: "0"`), then `wineboot -i` takes ~0.5 s and logs `Wine prefix ready in N ms`. Without a template it falls back to a cold `wineboot -i` (~30 s; every DSM connection waits for it).
