# syntax=docker/dockerfile:1
# Next.js is pre-built on the CI runner; this image just packages the output.
FROM ubuntu:24.04 AS runner
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive

# Node.js 22 (nodesource) + guacd (ubuntu universe) for in-browser RDP/VNC
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
       | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
       > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y --no-install-recommends \
       nodejs \
       guacd \
       libguac-client-rdp0 \
       libguac-client-vnc0 \
       wine wine64 \
       xvfb \
       x11vnc \
       xdotool \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs appuser

# Pre-built output uploaded by the build-app CI job
COPY --chown=appuser:nodejs public ./public
COPY --chown=appuser:nodejs .next/standalone ./
COPY --chown=appuser:nodejs .next/static ./.next/static

# Use custom server.js (WebSocket SSH/RDP/VNC proxy on same port as Next.js).
COPY --chown=appuser:nodejs server.js ./server.js

# Reinstall bcrypt for the target architecture.
# standalone bundles the amd64 build-machine binary; replace with the correct arch.
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefix /tmp/bcrypt-pkg --no-save --no-audit --no-fund bcrypt && \
    cp -r /tmp/bcrypt-pkg/node_modules/bcrypt /app/node_modules/bcrypt && \
    rm -rf /tmp/bcrypt-pkg

# Install ws and ssh2 for the WebSocket proxies.
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefix /tmp/extra-pkg --no-save --no-audit --no-fund ws ssh2 && \
    cp -r /tmp/extra-pkg/node_modules/. /app/node_modules/ && \
    rm -rf /tmp/extra-pkg

USER appuser
EXPOSE 8020
ENV PORT=8020 HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -sf http://127.0.0.1:8020/api/health || exit 1

CMD ["node", "server.js"]
