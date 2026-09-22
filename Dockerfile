# syntax=docker/dockerfile:1
# Next.js is pre-built on the CI runner; this image just packages the output.
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 appuser

# Pre-built output uploaded by the build-app CI job
COPY --chown=appuser:nodejs public ./public
COPY --chown=appuser:nodejs .next/standalone ./
COPY --chown=appuser:nodejs .next/static ./.next/static

# Reinstall bcrypt for the target architecture.
# standalone bundles the amd64 build-machine binary; replace with the correct arch.
# Use --prefix so only bcrypt+deps are installed (no package.json → no 400+ pkg reinstall).
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefix /tmp/bcrypt-pkg --no-save --no-audit --no-fund bcrypt && \
    cp -r /tmp/bcrypt-pkg/node_modules/bcrypt /app/node_modules/bcrypt && \
    rm -rf /tmp/bcrypt-pkg

USER appuser
EXPOSE 8095
ENV PORT=8095 HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8095/api/health || exit 1

CMD ["node", "server.js"]
