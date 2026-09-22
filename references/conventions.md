# Conventions

## CI / GitHub Actions

- `enforce-main.yml` — force-pushes any non-main branch to `main`, then triggers `build.yml` via `workflow_dispatch`
- `build.yml` — multi-arch Docker build (amd64 + arm64), push to `ghcr.io/claudeailab/webapp`
- GHCR login uses `secrets.CR_PAT`, never `secrets.GITHUB_TOKEN`
- Version tag format: `ghcr.io/claudeailab/webapp:v{version}` + `:latest`

## Docker Image

- Registry: `ghcr.io/claudeailab/webapp`
- Base: `node:22-alpine`, standalone Next.js output
- Multi-arch manifest via `docker buildx imagetools create`

## Environment Variables

All prefixed `WEBAPP_`. Never `NEXT_PUBLIC_*`. Stored server-side only.

Core vars: `WEBAPP_JWT_SECRET`, `WEBAPP_ADMIN_JWT_SECRET`, `WEBAPP_ENCRYPTION_KEY`, `WEBAPP_ADMIN_EMAIL`, `WEBAPP_ADMIN_PASSWORD`, `WEBAPP_DB_{HOST,PORT,USER,PASSWORD,NAME}`

Feature flags: `WEBAPP_M365_ENABLED`, `WEBAPP_SMTP_ENABLED`, `WEBAPP_ANTHROPIC_ENABLED`, `WEBAPP_OPENAI_ENABLED`, `WEBAPP_STRIPE_ENABLED`

## Database

MySQL + Drizzle ORM. Table prefix: `webapp_`. Auto-migrated on startup. AES-256-GCM encryption for all settings stored in `webapp_settings`.

## Versioning

`version.json` is the source of truth. `package.json` and `package-lock.json` must match. Bump all three on every push.

## MCP GitHub Tools (vs curl)

Always prefer `mcp__github__*` tools over curl for GitHub API calls — the MCP server is not subject to CCR proxy restrictions. Use curl only for GHCR registry API (`ghcr.io/v2/...`) or non-Actions GitHub REST reads.
