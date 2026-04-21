# ClinicSign

HIPAA-aware document signing for small medical practices — Next.js + Express + Prisma + Clerk + AWS (RDS, S3) + Vercel for the web app.

## Quick start (local development)

```bash
git clone <your-repo-url> && cd clinicsign
npm install
```

1. **AWS (required for API):** provision with Pulumi — see **`infra/README.md`** and **`infra/AWS_SETUP_GUIDE.md`**. Copy stack outputs into repo root **`.env`** (start from **`.env.example`**).
2. **Clerk, Resend, etc.:** fill keys in **`.env`** and **`apps/web/.env.local`** per **`.env.example`** / **`apps/web/.env.example`**.
3. **Database:** `npm run db:migrate` (from repo root; targets RDS via `DATABASE_URL`).
4. **Run:** `npm run dev` (Turborepo: web + API).

Optional: run only the API container locally — **`npm run docker:api`** (Postgres/S3 still AWS; see **`docker-compose.yml`**).

## Deployment (what we use)

| Piece | Where |
|--------|--------|
| **Web** | **Vercel** — project root **`apps/web`**. |
| **API** | **AWS** — container in **ECR**, run on **ECS Fargate** behind an **ALB** (wire after **`pulumi up`**; ECR + RDS + S3 come from Pulumi today — see **`infra/README.md`**). |
| **Data** | **RDS PostgreSQL** + **S3** (+ **KMS**, **IAM** app user) via **`infra/`**. |

There is **no** LocalStack and **no** Dockerized PostgreSQL for app data — the database is **RDS**.

End-to-end checklist: **`infra/AWS_SETUP_GUIDE.md`**.

## Repository layout

```
clinicsign/
├── .cursor/rules/           Cursor rules (TypeScript, Next, API, security, …)
├── apps/
│   ├── web/                 Next.js 16 App Router (Vercel)
│   └── api/                 Express API (Docker → ECR → ECS)
├── infra/                   Pulumi (VPC, RDS, S3, KMS, IAM, ECR, …)
│   ├── README.md            What gets created + deploy snippets
│   ├── AWS_SETUP_GUIDE.md   Account, Pulumi, Vercel, ECS path
│   └── ARCHITECTURE_INFRASTRUCTURE.md  Longer reference (patterns, tradeoffs)
├── packages/                shared-types, config, …
├── docker-compose.yml       Optional local API container only (no local Postgres)
├── PROJECT.md               Product spec, schema, flows
├── UI_AND_STACK_REFERENCE.md  Frontend stack notes
└── README.md                This file
```

If you use Cursor starter prompts, they may live in `_setup/` (gitignored) — not required for the app.

## Clerk webhooks from localhost

Clerk needs **HTTPS**. Run the API on **:4000**, expose it with a tunnel (**`npm run tunnel:api`** with ngrok, or **`npm run tunnel:api:lt`** with localtunnel), then register the tunnel URL + `/api/webhooks/clerk` in the Clerk dashboard and set **`CLERK_WEBHOOK_SECRET`** in **`.env`**. See **`.env.example`** comments for details.

## AWS env mapping

After **`cd infra && pulumi up`**, use **`pulumi stack output --show-secrets`** and map outputs to **`.env`** (`DATABASE_URL`, `S3_*`, `AWS_*`). Do **not** set **`AWS_ENDPOINT_URL`**.

## Build phases (summary)

- **Phase 1:** Core signing flow, Clerk, dashboard, PDF upload/fields, email links, patient signing, S3 storage, audit log — **working locally and deployable** (Vercel + AWS as above).
- **Phase 2 (stretch):** AI field detection, summaries, optional chat — **`PROJECT.md`**.

## HIPAA stance

The architecture targets HIPAA-eligible services and controls described in **`PROJECT.md`**. Certification requires BAAs, operational processes, and more — position the demo as **architected for**, not **certified**, HIPAA.

## License / use

Private / take-home use unless you add a license.
