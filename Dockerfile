# Image de LAPELEC Devis, construite automatiquement par GitHub Actions (voir .github/workflows/image.yml).
# Construction locale : docker build -t devismaker-lapelec .

# --- étape 1 : tests et construction de dist/
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
ARG BUILD_SHA=""
ENV BUILD_SHA=$BUILD_SHA
RUN npm run typecheck && npm test && npm run build

# --- étape 2 : image finale, sans dépendance (seulement Node et dist/)
FROM node:22-alpine
WORKDIR /app
COPY --from=build /src/dist/ /app/
ENV PORT=8090 DATA_DIR=/data NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/api/etat > /dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
