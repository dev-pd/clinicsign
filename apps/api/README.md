# `apps/api` — ClinicSign backend

Express + TypeScript + Prisma + Pino + Zod, running on ECS Fargate behind an ALB and CloudFront.

Every route validates with Zod, every error has a stable `code`, every interesting event writes an `AuditLog` row.

---

## At a glance

| | |
|---|---|
| Runtime | **Node 22** (Alpine in the container) |
| Web framework | **Express 4** |
| Language | **TypeScript 5.7**, strict, ESM (`"type": "module"`) |
| Validation | **Zod 4** at every boundary (body, params, query, env) |
| ORM | **Prisma 6** against **PostgreSQL 16** (RDS) |
| Auth (clinician) | **`@clerk/express`** — verifies Clerk JWT on each request |
| Auth (patient) | **256-bit random token** in URL, **SHA-256** hash in DB, single-use, 7-day TTL |
| File storage | **AWS S3** via `@aws-sdk/client-s3` + presigned URLs |
| PDF rendering | **`pdf-lib`** — pure JS, runs in Fargate without native deps |
| Email | **Resend** today; SES wired for the BAA path |
| Logging | **Pino** (JSON in prod, `pino-pretty` in dev) + **`pino-http`** for request IDs |
| Security middleware | **Helmet**, **CORS** allowlist, **express-rate-limit** on auth + signing |
| Uploads | **Multer** memory storage, **25 MB** cap |
| Tests | Vitest (scaffolded; not the strong suit of this demo) |

---

## Quick start

```bash
cp .env.example ../../.env          # repo root .env (yes, the API reads from root)
npm install                          # from monorepo root (Turborepo)
npm run db:migrate                   # against the DATABASE_URL in .env (RDS)
npm run dev                          # → http://localhost:4000
```

`.env` (repo root) needs at minimum:

```env
DATABASE_URL=postgresql://clinicsign:...@<rds-host>:5432/clinicsign?sslmode=require
S3_BUCKET_NAME=clinicsign-dev-docs-xxxxx
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
CLERK_SECRET_KEY=sk_...
CLERK_PUBLISHABLE_KEY=pk_...
CLERK_WEBHOOK_SECRET=whsec_...
JWT_SIGNING_SECRET=<32+ chars, used by token.service>
RESEND_API_KEY=re_...
EMAIL_FROM=onboarding@resend.dev
WEB_APP_URL=http://localhost:3000
LOG_LEVEL=debug
```

Env is parsed by **Zod** in `src/config/env.ts` — if anything's missing the process refuses to start with a structured error, no half-booted services.

---

## Directory map

```
apps/api/
├── src/
│   ├── config/
│   │   ├── env.ts              Zod-validated env, single source
│   │   └── logger.ts           pino factory
│   ├── middleware/
│   │   ├── load-app-user.ts    Clerk JWT → DB User → req.appUser
│   │   ├── error-handler.ts    centralized; converts ZodError + ApiError
│   │   ├── rate-limit.ts       per-route limiters
│   │   └── request-id.ts       attaches/forwards x-request-id
│   ├── routes/
│   │   ├── index.ts            mounts /api/* and /health
│   │   ├── documents.routes.ts clinician CRUD + send/resend/void/download/audit
│   │   ├── sign.routes.ts      patient view + complete (token-scoped)
│   │   └── me.ts               current user (Clerk → DB)
│   ├── services/
│   │   ├── documents.service.ts        list / create / patch / void; clinic-scoped
│   │   ├── document-send.service.ts    send + resend orchestration
│   │   ├── signing.service.ts          token validation, value persistence, completion
│   │   ├── pdf-field-renderer.ts       overlays patient values onto the original PDF
│   │   ├── s3.service.ts               key shape, upload, presign
│   │   ├── s3-client.ts                S3Client construction (today: env keys)
│   │   ├── token.service.ts            random + SHA-256 hash + verify
│   │   ├── email.service.ts            Resend transport + templates
│   │   ├── audit.service.ts            single chokepoint for AuditLog inserts
│   │   └── user-sync.service.ts        Clerk webhook → DB user + clinic
│   ├── schemas/                Zod schemas, one file per resource
│   ├── utils/
│   │   └── errors.ts           ApiError class + helpers (badRequest, notFound, …)
│   ├── app.ts                  Express app construction (Helmet, CORS, routes)
│   └── server.ts               http.listen + SIGTERM graceful shutdown
├── prisma/
│   ├── schema.prisma           6 models, 10 audit event types
│   ├── migrations/             flat migration history
│   └── seed.ts                 minimal demo data
├── scripts/
│   └── backfill-users-from-clerk.ts
├── tests/                      Vitest scaffold
└── Dockerfile                  multi-stage; startup runs `migrate deploy` then server
```

---

## Route map

All routes live under `/api`. Auth column: **C** = Clerk JWT (`req.appUser` populated), **T** = patient signing token in URL, **W** = Clerk webhook signature, **—** = none.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | — | ALB target group health check; touches no DB / no S3 |
| `POST` | `/api/webhooks/clerk` | W | `user.created` / `user.updated` / `user.deleted` → `user-sync.service` |
| `GET` | `/api/me` | C | current clinician + clinic |
| `GET` | `/api/documents` | C | paginated list, filterable by `?status=` |
| `POST` | `/api/documents` | C | multipart `pdf` + `title` → draft document |
| `GET` | `/api/documents/:id` | C | full doc with fields, recipients, audit |
| `PATCH` | `/api/documents/:id` | C | title and/or `fields[]` (full replace) |
| `DELETE` | `/api/documents/:id` | C | soft delete → `VOIDED` |
| `POST` | `/api/documents/:id/send` | C | generate token + email recipient, status → `SENT` |
| `POST` | `/api/documents/:id/resend` | C | rotate token + re-email |
| `GET` | `/api/documents/:id/audit` | C | audit log entries for this document |
| `GET` | `/api/documents/:id/download?type=original\|signed` | C | 5-min presigned S3 URL |
| `GET` | `/api/sign/:token` | T | document + fields + summary for patient view |
| `POST` | `/api/sign/:token/complete` | T | persist `fieldValues[]`, render signed PDF, status → `SIGNED` |

**Errors** look like:

```json
{ "error": { "code": "DOCUMENT_NOT_FOUND", "message": "...", "requestId": "..." } }
```

`code` is stable; client UI keys on it. `requestId` is forwarded from the inbound `x-request-id` header (or generated in `request-id.ts`) and included in every Pino log line for that request, so you can grep one ID across CloudWatch.

---

## The patient signing flow

```
Clinician POST /documents/:id/send
        │
        ▼
token.service.generate()  →  raw (32 bytes, base64url)         emailed to patient
                          \  hash (SHA-256)                     stored on DocumentRecipient
                           \  expiresAt (now + 7 days)
                            \ status: SENT
                             \ AuditLog: DOCUMENT_SENT

Patient GET /api/sign/:token
        │
        ▼
token.service.verify()    →  SHA-256(raw) → DocumentRecipient by tokenHash
                          →  reject if expired, signedAt set, or doc voided
                          →  AuditLog: DOCUMENT_VIEWED  (idempotent on first view)
                          →  return doc + fields + presigned URL for original PDF

Patient POST /api/sign/:token/complete  { fieldValues: [...] }
        │
        ▼
signing.service.completeSigning()
  ├─ verify token again
  ├─ validate every required field has a non-empty value
  ├─ s3.getObject(originalPdfKey) → Buffer
  ├─ pdf-field-renderer overlays values per field type:
  │     SIGNATURE  → embedded PNG (drawn or typed-rendered)
  │     INITIAL    → embedded PNG
  │     TEXT       → drawText with computed font size to fit
  │     DATE       → formatted text
  │     CHECKBOX   → drawRectangle / draw check
  ├─ s3.putObject(signedPdfKey)  (different key prefix than original)
  ├─ DocumentRecipient: signedAt + signedFromIp + signedUserAgent
  ├─ Document: status SIGNED, signedAt
  ├─ AuditLog: DOCUMENT_SIGNED  (with field-fill metadata)
  └─ email.service.sendCompletion({ provider, patient }) → Resend
```

`AuditLog` is the source of truth for "what happened, who did it, when". The model has no `update` or `delete` call sites in the codebase — it's append-only by convention and by review.

---

## Schema highlights (`prisma/schema.prisma`)

Six models, the interesting indexes called out:

| Model | Notes |
|---|---|
| `User` | `clerkUserId @unique`, `clinicId` FK; populated by Clerk webhook |
| `Clinic` | one per first-login user today; settings come later |
| `Document` | `status` enum, `originalPdfKey`, `signedPdfKey?`, indexed by `(clinicId, status)` |
| `DocumentField` | `type` enum (`SIGNATURE / TEXT / DATE / CHECKBOX / INITIAL`), `x/y/width/height` as **0–1 percentages** (page-relative — survives any render width) |
| `DocumentRecipient` | `tokenHash @unique`, `tokenExpiresAt`, optional `signedAt / signedFromIp / signedUserAgent` |
| `AuditLog` | `actorType` × `eventType`, `metadata Json`, indexed by `(documentId, timestamp)` |

Run migrations:

```bash
npm run db:migrate          # creates a dev migration
npx prisma migrate deploy   # what the ECS task runs on every boot
npm run db:studio           # GUI
npm run seed                # demo data
```

---

## What runs in production

The ECS task command is:

```sh
cd apps/api && ../../node_modules/.bin/prisma migrate deploy && node dist/server.js
```

Migrations run on every task boot. `prisma migrate deploy` is idempotent — it only applies *new* migration files — so this is safe to run on a 2-task rolling deploy. The first task pays the migration latency; the second sees no pending migrations and starts immediately.

Health check is `GET /health`, returns `{ status: "ok" }`. **It deliberately touches no downstream**. A healthy task is one that can serve HTTP; if RDS is having a moment, we want the API to stay in the load balancer and surface the issue, not flap and trigger a deploy.

`SIGTERM` handling lives in `server.ts`: close the HTTP server, `prisma.$disconnect()`, exit 0. ECS gives 30 seconds before `SIGKILL`.

---

## Observability

- **Structured logs** (Pino): every request gets `requestId`, `userId` (when Clerk-authed), `documentId` (when in scope), latency, status. Search CloudWatch for one `requestId` and you get the entire request lifecycle.
- **Audit log table**: business-level history, queryable from SQL.
- **CloudWatch Logs** group: `/clinicsign/<stack>/api`, 14-day retention.
- **No `console.log` in production code.** Pino only; enforced at review time.

---

## Local development tips

- Want a local API container talking to RDS + real S3? `npm run docker:api` (from root) — there is no local Postgres service; that's intentional.
- Want Clerk webhooks against your laptop? `npm run tunnel:api` (ngrok) or `npm run tunnel:api:lt` (localtunnel), then register the tunnel URL + `/api/webhooks/clerk` in the Clerk dashboard. **Clerk requires HTTPS — that's why the tunnel exists.**
- Prisma client out of sync after a pull? `npm run db:generate`.
- Want to inspect what the API actually returned? Every response error has a `requestId`; grep it in CloudWatch (or local stdout in dev).

---

## Troubleshooting: `GET /api/me` or dashboard "Could not load your profile"

The dashboard calls `GET /api/me` with a Clerk Bearer token. Failures usually fall into one of these buckets:

1. **Database schema behind the code** — After pulling (e.g. `Clinic` → `Organization` rename), run migrations against the same `DATABASE_URL` the API uses:
   - Local: from repo root or `apps/api`, `npx prisma migrate deploy` (or `npm run db:migrate` for dev).
   - ECS: the task definition should run `prisma migrate deploy` before `node dist/server.js`; confirm the **deployed image** includes the latest `prisma/migrations/*` files and redeploy if needed.
2. **Prisma engine errors** — Connection refused, TLS, `relation "Organization" does not exist`, etc. Return **503** with `DATABASE_UNAVAILABLE` and the real message in **non-production** logs. Check CloudWatch (or local Pino output) for the full Prisma error string.
3. **404 + `USER_NOT_PROVISIONED`** — Clerk user exists but no `User` row yet. Trigger the Clerk webhook (`user.created` / `user.updated`) or wait for sync; the dashboard handles 404 with a specific card.
4. **Clerk env mismatch** — `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` on the API must be from the **same** Clerk application as the Next.js app that mints the JWT.
5. **`APP_PUBLIC_NAME` set to empty in ECS** — Treated as invalid by Zod and blocks startup; if your orchestration injects an empty string, remove the variable so the default applies.

---

## When to touch what

| Change | Where |
|---|---|
| New API route | `routes/*.routes.ts` + Zod schema in `schemas/` + service in `services/` (don't put Prisma in routes) |
| New audit event | add to `EventType` enum (`prisma/schema.prisma`), migrate, then call `audit.service.write(...)` from the relevant service |
| New field type | `FieldType` enum + `pdf-field-renderer.ts` switch arm |
| Change S3 key shape | `s3.service.ts` (also update `infra/` lifecycle rules if prefix changes) |
| New rate-limited route | wrap with limiter from `middleware/rate-limit.ts` |
| New env var | add to `config/env.ts` Zod schema *and* `infra/` `apiEnv` / `apiEnvSecret` |

---

## What's out of scope today

- Multi-recipient signing order
- Document templates (clinic-level reusable forms)
- AI: field auto-detection, plain-language summary, document chat
- SES as the active email path (Resend works today; SES is policy-attached but unused)
- Background jobs / queue — every operation is synchronous in the request path

See [`PROJECT.md`](../../PROJECT.md) for the full spec and the deliberately deferred features.
