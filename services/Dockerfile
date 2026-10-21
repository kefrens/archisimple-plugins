# The plugin-services image (Sprint 002.5a DEC-10; ADR-0114 Rule 3).
#
# One container, `plugin-services`, runs the gateway, which mounts every
# companion service of this repository at /plugins-api/<package id>/.
#
# Built from the PARENT folder of this checkout, by archisimple's compose file
# and docker.yml (096.8a DEC-4, DEC-5):
#
#   docker build -f archisimple-plugins/services/Dockerfile -t plugin-services ..
#
# so every COPY path starts at archisimple-plugins/services/. The compose
# service is opt-in (profile `plugin-services`), publishes no port, and is
# reached only through web's nginx, behind Caddy's authentication.
#
# Its environment: PLUGIN_SERVICES_DATA_DIR (/data), PLUGIN_SERVICES_PORT
# (4500), PLUGIN_SERVICES_LOG_KEY (from .env; random per start when unset),
# ARCHISIMPLE_AI_SERVICE_URL (unused before 002.5b), and each service's own
# variables (see its README). No model key, ever (ADR-0114 Rule 7).

# The base image pinned by digest (archisimple Sprint 096.13, DEC-9/DEC-12, Q6):
# this image is built from the same plugins commit as the web image's pins, and
# is trusted the way any image is — by digest — so its base is not left to
# whatever the tag points at today. A security update is a deliberate bump:
# `docker buildx imagetools inspect node:22-alpine` prints the new index digest.
# Read 2026-10-21 (the multi-architecture index).
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

ENV NODE_ENV=production \
    PLUGIN_SERVICES_DATA_DIR=/data \
    PLUGIN_SERVICES_PORT=4500

WORKDIR /srv/services

# Dependencies first, for the layer cache. Only folders with a lockfile have
# dependencies; the gateway has none. `--omit=optional` keeps pdfjs-dist's
# native canvas out: text extraction never draws (002.5a DEC-2).
COPY archisimple-plugins/services/fr-urban-rules-service/package.json \
     archisimple-plugins/services/fr-urban-rules-service/package-lock.json \
     ./fr-urban-rules-service/
# `--ignore-scripts`: no install script runs at build time (pdfjs-dist has none).
RUN cd fr-urban-rules-service && npm ci --omit=dev --omit=optional --ignore-scripts
# Fails the build on a high or critical advisory in what ships. It needs the
# registry at build time; publish-index.yml runs the same audit on every push
# to main, so a new advisory is seen before an image is built.
RUN cd fr-urban-rules-service && npm audit --omit=dev --audit-level=high

COPY archisimple-plugins/services/gateway/package.json ./gateway/package.json
COPY archisimple-plugins/services/gateway/src ./gateway/src
COPY archisimple-plugins/services/fr-urban-rules-service/src ./fr-urban-rules-service/src

RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node

EXPOSE 4500
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4500/plugins-api/health >/dev/null || exit 1

CMD ["node", "gateway/src/gateway.mjs"]
