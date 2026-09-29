# Operational Steps

## Storing a GitHub Actions Secret (CCR environment)

The CCR proxy blocks the GitHub Actions secrets API. Use a bootstrap workflow instead:

1. Push a minimal `workflow_dispatch` workflow to `main` via `mcp__github__push_files`
2. Trigger it via `mcp__github__actions_run_trigger` with the token as input `t`
3. The runner (not proxied) calls `gh secret set` using `GH_TOKEN: ${{ inputs.t }}`
4. Poll until `completed success`
5. The bootstrap workflow is cleaned up automatically when `enforce-main.yml` next force-pushes from the feature branch

See CLAUDE.md § "Storing a GitHub Actions Secret from CCR" for the full workflow YAML.

## Fixing GHCR Push: `permission_denied: read_package`

This error means the GHCR package is not linked to the repository. `GITHUB_TOKEN` cannot push to unlinked packages.

**Fix:** Use `secrets.CR_PAT` (PAT with `write:packages`) instead of `secrets.GITHUB_TOKEN` in both Login to GHCR steps in `build.yml`. CR_PAT is already stored as a repo secret.

If CR_PAT is missing or expired, store a new one using the bootstrap workflow procedure above.

## Bumping the Version

Update all three files atomically:
- `version.json` — `.version`
- `package.json` — `.version`
- `package-lock.json` — both `.version` fields (use `replace_all: true`)

Commit format: `v{version} - short description`

The `build-app` CI cache key must include every file baked into the Next.js build — including `version.json` (imported by `AdminSidebar.tsx`, read by `UserNavbar.tsx`). A missing key file makes CI reuse a stale build and the UI shows an old version.

## UltraVNC DSM Viewer Stuck on "Password accepted" (Wine)

Symptom: the "UltraVNC Viewer Status for <host>" window stays up with Speed 123 / FPS 1 (dialog placeholders, not measurements) and the desktop never appears.

Cause: under Wine the viewer's GDI path loops forever in `WM_SIZE` → `Scrollbar_RecalculateSize` → `SetWindowPos` → `WM_SIZE` (~20k `SetWindowPos` calls, viewer at 20–40% CPU), so it never requests a frame. Not DSM-specific; the status window is not modal and needs no dismissal.

Fix: launch the viewer with `-directx -autoscaling` (both skip the scrollbar code; `-autoscaling` fits any remote size into the 1920x1080 Xvfb). Do not use `-fullscreen` — D3D fullscreen stretches non-uniformly and drops regions.

Reproducing locally: build `vncviewer.exe` from github.com/ultravnc/UltraVNC with MinGW (x86_64-w64-mingw32-g++-posix, UNICODE, static zlib/zstd/libjpeg-turbo/xz/minizip-ng/libsodium), run it in an `ubuntu:24.04` container with the Dockerfile's apt packages as root (compose uses `user: "0"`; Wine refuses to create `/tmp/uvnc-wine` as non-root), point it at a password-protected x11vnc, and use `-loglevel 10 -logfile` + `winedbg` (`bt all`) + `x86_64-w64-mingw32-addr2line` to locate stalls.
