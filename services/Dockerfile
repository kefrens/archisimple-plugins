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

FROM node:22-alpine

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
