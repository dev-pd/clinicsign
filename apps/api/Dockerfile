# ClinicSign API Dockerfile
#
# Build from repository root (`.dockerignore` at repo root applies):
#   docker build -t clinicsign-api -f apps/api/Dockerfile .
# Run (host 4000):
#   docker run -p 4000:4000 --env-file .env clinicsign-api:local
# Recommended when `npm run dev` uses 4000 — map another host port, e.g.:
#   docker run -p 4001:4000 clinicsign-api:local
# Or: `npm run docker:api` (Compose exposes :4001 on the host)
#
# Prisma: `npm run build` runs `prisma generate`. Copy `apps/api/prisma` in the
# runner image if you run `prisma migrate deploy` at container start (add prisma CLI to prod deps or use CI migrations).

FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl

COPY package.json package-lock.json turbo.json ./
COPY packages/config/package.json ./packages/config/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/

RUN npm ci

COPY packages ./packages
COPY apps/api ./apps/api

RUN npm run build --workspace=@clinicsign/api

RUN npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache tini
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/packages ./packages
COPY --from=builder --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=app:app /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=app:app /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=app:app /app/package.json ./package.json

USER app

EXPOSE 4000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "apps/api/dist/index.js"]
