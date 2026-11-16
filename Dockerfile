# syntax=docker/dockerfile:1.7
# MoinMorni: Webseite, Panel, Hub für die Plugins und Discord-Bot in einem Image. Der Motor (MorniHosting) hat sein
# eigenes Image aus vendor/mornihosting.

# Das Netzwerk-Plugin (Velocity + Paper, Java 25). Scheitert sein Bau, entsteht das Image trotzdem – MoinMorni
# meldet dann, dass das Plugin fehlt, statt das ganze Update abzubrechen.
FROM maven:3.9.16-eclipse-temurin-25 AS plugin
WORKDIR /src
# Erst nur die pom.xml: Die Bibliotheken landen in einer eigenen Schicht und werden beim nächsten Update nicht neu
# geladen, solange sich die pom.xml nicht ändert.
COPY plugins/moinmorni-network/pom.xml ./
RUN mvn -B -q dependency:go-offline || true
COPY plugins/moinmorni-network/src ./src
RUN mkdir -p target && (mvn -B -q package || echo "Netzwerk-Plugin konnte nicht gebaut werden" > target/BUILD_FAILED.txt)

FROM node:22-alpine AS build
# Bauwerkzeuge für native Module (better-sqlite3) nur in der Bau-Stufe.
# hadolint ignore=DL3018
RUN apk add --no-cache python3 make g++ && corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/builder/package.json packages/builder/
COPY tools/lobby-entwuerfe/package.json tools/lobby-entwuerfe/
RUN pnpm install --frozen-lockfile
# Die Server-Seiten von MorniHosting werden ins Panel eingebettet: der Web-Bau braucht ihre Pakete.
COPY vendor/mornihosting/package.json vendor/mornihosting/pnpm-lock.yaml vendor/mornihosting/pnpm-workspace.yaml vendor/mornihosting/.npmrc vendor/mornihosting/
COPY vendor/mornihosting/apps/web/package.json vendor/mornihosting/apps/web/
COPY vendor/mornihosting/apps/server/package.json vendor/mornihosting/apps/server/
COPY vendor/mornihosting/packages/shared/package.json vendor/mornihosting/packages/shared/
RUN pnpm --dir vendor/mornihosting install --frozen-lockfile
COPY . .
ARG MM_VERSION=dev
RUN pnpm --filter @moinmorni/web build \
 && pnpm --filter @moinmorni/server build \
 && pnpm --filter @moinmorni/server deploy --prod --legacy /out \
 && cp -r apps/server/dist apps/server/drizzle /out/

FROM node:22-alpine
ARG MM_VERSION=dev
LABEL org.opencontainers.image.title="MoinMorni" \
      org.opencontainers.image.description="Webseite, Panel und Hub des Minecraft-Netzwerks MoinMorni" \
      org.opencontainers.image.source="https://github.com/pmornhart/moinmorni.net" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${MM_VERSION}"
ENV NODE_ENV=production \
    MM_DATA_DIR=/data \
    MM_WEB_DIR=/app/web \
    MM_VERSION=${MM_VERSION}
WORKDIR /app
COPY --from=build /out /app/server
COPY --from=build /src/apps/web/dist /app/web
COPY --from=plugin /src/target/ /app/plugins/
RUN mkdir -p /data && chown 1000:1000 /data
USER 1000:1000
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/status').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "/app/server/dist/index.js"]
