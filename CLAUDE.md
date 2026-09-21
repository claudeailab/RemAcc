# CLAUDE.md — webapp

## Rules (non-negotiable)

- Always build after changes; run GitHub Actions after every push
- Verify `main-only` ruleset at start of every session; recreate if missing
- **Mobile-first always** — no hardcoded pixel dimensions anywhere
- Modern, intuitive, elegant UI — no over-engineering
- **Complete removal** when deleting anything — no dead code, orphaned files, stale references
- Absolute visual and behavioural consistency — enforced via `ui-conventions.ts`
- Version shown in admin sidebar and user profile menu only — nowhere else
- Version bumped with every push; commit message format: `v{version} - short description`
- Aggressively minimize GitHub Actions runtime: BuildKit cache, GHA layer cache, path filters, concurrency groups
- **After every resolved issue**: update the webapp skill (`references/steps.md` and `references/conventions.md`) so the fix is captured for future sessions

## Tech Stack

- Next.js (App Router), TypeScript, TailwindCSS, shadcn/ui
- Drizzle ORM + MySQL
- bcrypt, nodemailer, stripe, @anthropic-ai/sdk, openai
- M365: @azure/msal-node + @microsoft/microsoft-graph-client

## ENV Prefix

`WEBAPP_` — all secrets here, never `NEXT_PUBLIC_*`
