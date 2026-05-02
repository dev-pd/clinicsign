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
# Prisma: `npm run build` runs `prisma generate`. Container start runs `migrate deploy`
# then the server (same as ECS task command in `infra/`), so ad-hoc `docker run`
# without an override still applies pending migrations.

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

# NOTE: We intentionally keep devDependencies in the runtime image so the Prisma CLI
# is available to run migrations from inside ECS (RDS is private, so laptop migrations
# won't work without extra networking). For a long-lived production setup, prefer
# CI-run migrations or a dedicated migration task/image.
# RUN npm prune --omit=dev

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

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["sh", "-c", "cd apps/api && ../../node_modules/.bin/prisma migrate deploy && node dist/server.js"]
