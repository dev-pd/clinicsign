# ClinicSign — AWS + Pulumi setup guide

Walkthrough: from "I have an AWS account" (or none) to "the API is live on an HTTPS URL and Vercel is talking to it". For the *why* behind the architecture, read **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

**Target architecture:** **Vercel** hosts the Next.js app (`apps/web`). **AWS** hosts the API (Docker image in **ECR**, run on **ECS Fargate** behind an **ALB**, fronted by **CloudFront** for HTTPS), plus **RDS PostgreSQL**, **S3**, **KMS**, and **IAM** — all provisioned via **Pulumi** under **`infra/`**.

Standing up AWS adds real time on top of app work. Do it after the app runs locally; don't let infra block features.

---

## Decision tree

```
Is Phase 1 working end-to-end locally?
│
├── NO  → Finish Phase 1 first.
│
└── YES → Deploy
          │
          ├── Full path (this guide): Pulumi (`infra/`) + Vercel + API on AWS
          └── No time?  Ship a local demo + README pointing at this guide.
```

---

## What you're building

```
┌─ Vercel ─────────────────────────┐
│  Next.js (apps/web)              │
└──────────────┬───────────────────┘
               │ HTTPS (NEXT_PUBLIC_API_URL)
               ▼
┌─ AWS ────────────────────────────┐
│  CloudFront (HTTPS)              │
│     ↓                            │
│  ALB (HTTP origin) → ECS Fargate │
│  RDS PostgreSQL, S3 (PDFs), KMS  │
│  IAM (app user from Pulumi)      │
└──────────────────────────────────┘
```

Pulumi provisions the full stack. Your public API base URL is the **CloudFront** output `apiBaseUrl` (HTTPS), which you use for **Clerk webhooks** and your Vercel `NEXT_PUBLIC_API_URL`.

---

## Step 1 — AWS account (~15 min)

1. Open https://aws.amazon.com → Create an AWS account.
2. Credit card required; you pay for usage beyond free tier.
3. Choose **Basic Support – Free**.

Then immediately:

1. **MFA on the root account** (Security credentials → MFA).
2. **Billing alarm** (e.g. `$5` cap): Billing → preferences → enable billing alerts; CloudWatch → alarm on estimated charges.
3. **Stop using root** for daily work — create an admin IAM user next.

> **Free Tier caveat**: NAT Gateway, RDS, ALB, ECS uptime, and data transfer bill even at low traffic. Run `pulumi destroy` when you're not actively using the stack.

---

## Step 2 — Admin IAM user (~10 min)

1. Root → **IAM** → **Users** → **Create user** (programmatic access if you'll use the CLI for Pulumi).
2. Attach **AdministratorAccess** (or narrower if you prefer).
3. Save credentials in a password manager; enable **MFA** on this user.

You'll use this identity for `aws configure` and `pulumi up` — **not** for the app at runtime.

---

## Step 3 — AWS CLI (~5 min)

```bash
brew install awscli                 # macOS

aws configure --profile clinicsign
# Access key + secret from the admin user
# Region: e.g. us-east-1
# Output: json

aws sts get-caller-identity --profile clinicsign
```

The **running API** uses the **Pulumi-created IAM user** keys from stack outputs (`iamAccessKeyId` / `iamSecretAccessKey`), not necessarily this admin profile.

---

## Step 4 — Pulumi CLI (~10 min)

```bash
brew install pulumi/tap/pulumi      # or https://www.pulumi.com/docs/install/

pulumi login                        # Pulumi Cloud (free for individuals)
```

---

## Step 5 — Deploy the infrastructure

The repo already ships **`infra/`**. Do **not** run `pulumi new`.

```bash
cd infra
npm install

# Optional break-glass: allow your laptop IP to connect to Postgres
# (normally DB is ECS-only)
# pulumi config set rdsAllowedCidr 203.0.113.45/32

AWS_PROFILE=clinicsign pulumi preview
AWS_PROFILE=clinicsign pulumi up
```

Retrieve outputs:

```bash
pulumi stack output --show-secrets
```

Map the relevant ones into the **repo root `.env`** (template in `.env.example`):

| Pulumi output | Env var |
|---|---|
| `databaseUrl` | `DATABASE_URL` |
| `s3BucketName` | `S3_BUCKET_NAME` |
| `iamAccessKeyId` | `AWS_ACCESS_KEY_ID` |
| `iamSecretAccessKey` | `AWS_SECRET_ACCESS_KEY` |
| `awsRegion` | `AWS_REGION` |

> **Do not** set `AWS_ENDPOINT_URL` — the SDK must use real AWS endpoints.

Apply Prisma migrations to RDS:

```bash
cd ../apps/api
npm run db:migrate
```

---

## Step 6 — Push the API image to ECR

`infra/` creates an **ECR** repository; build and push from the monorepo root:

```bash
ECR_URL=$(cd infra && pulumi stack output ecrRepositoryUrl)

aws ecr get-login-password --region us-east-1 --profile clinicsign \
  | docker login --username AWS --password-stdin "$ECR_URL"

# Important: --platform linux/amd64 (Fargate is amd64; mac default is arm64)
docker buildx build --platform linux/amd64 \
  -t "$ECR_URL:latest" \
  -f apps/api/Dockerfile . --push
```

---

## Step 7 — Inject API env vars into the ECS task

The infra provisions ECS/ALB/CloudFront, but the task definition only hardcodes `PORT`. Everything else (Clerk keys, `DATABASE_URL`, etc.) you provide via Pulumi config:

- `apiEnv` (object) — non-secret env vars
- `apiEnvSecret` (secret object) — secrets (encrypted in Pulumi state)

```bash
cd infra

# Non-secret
pulumi config set --path 'apiEnv.NODE_ENV'    'production'
pulumi config set --path 'apiEnv.LOG_LEVEL'   'info'
pulumi config set --path 'apiEnv.WEB_APP_URL' 'https://your-vercel-app.vercel.app'
pulumi config set --path 'apiEnv.EMAIL_FROM'  'onboarding@resend.dev'
pulumi config set --path 'apiEnv.AWS_REGION'  'us-east-1'

# Secrets (examples; use your own values)
pulumi config set --secret --path 'apiEnvSecret.DATABASE_URL' \
  "$(pulumi stack output databaseUrl --show-secrets)"
pulumi config set --secret --path 'apiEnvSecret.AWS_ACCESS_KEY_ID' \
  "$(pulumi stack output iamAccessKeyId)"
pulumi config set --secret --path 'apiEnvSecret.AWS_SECRET_ACCESS_KEY' \
  "$(pulumi stack output iamSecretAccessKey --show-secrets)"
pulumi config set --secret --path 'apiEnvSecret.S3_BUCKET_NAME' \
  "$(pulumi stack output s3BucketName)"
pulumi config set --secret --path 'apiEnvSecret.CLERK_SECRET_KEY'      'sk_...'
pulumi config set --secret --path 'apiEnvSecret.CLERK_PUBLISHABLE_KEY' 'pk_...'
pulumi config set --secret --path 'apiEnvSecret.CLERK_WEBHOOK_SECRET'  'whsec_...'
pulumi config set --secret --path 'apiEnvSecret.RESEND_API_KEY'        're_...'
pulumi config set --secret --path 'apiEnvSecret.JWT_SIGNING_SECRET'    '<32+ chars>'

AWS_PROFILE=clinicsign pulumi up    # re-renders task definition
```

After `pulumi up` you have:

- **`apiBaseUrl`** — `https://<cloudfront-domain>` — use this for Clerk webhooks **and** Vercel `NEXT_PUBLIC_API_URL`
- **`albDnsName`** — ALB origin DNS (HTTP, debugging only)

---

## Step 8 — Frontend on Vercel (~15 min)

1. Import the GitHub repo on https://vercel.com.
2. **Root directory:** `apps/web` (it's a monorepo).
3. **Environment variables**:

   | Var | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `apiBaseUrl` from Pulumi (CloudFront URL) |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | from Clerk dashboard |
   | `CLERK_SECRET_KEY` | from Clerk dashboard |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
   | `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
4. Deploy.

Add the Vercel domain to:

- Clerk's **allowed origins** (Clerk dashboard → Domains)
- API's **CORS allowlist** (`apps/api/src/app.ts`, `cors({ origin: [...] })`)

---

## Step 9 — Wire Clerk webhooks (HTTPS required)

In the Clerk dashboard:

1. **Webhooks** → **Add endpoint**
2. URL: `<apiBaseUrl>/api/webhooks/clerk`
3. Subscribe to `user.created`, `user.updated`, `user.deleted`
4. Copy the signing secret → `CLERK_WEBHOOK_SECRET` (Pulumi `apiEnvSecret`, then `pulumi up`)

For local development, Clerk requires HTTPS too — use `npm run tunnel:api` (ngrok) and register the tunnel URL.

---

## Step 10 — Verify end-to-end

1. Open the Vercel URL → sign in with Google (Clerk)
2. Confirm the Clerk webhook deliveries hit `<apiBaseUrl>/api/webhooks/clerk` (Clerk dashboard → Webhooks → Recent attempts)
3. Create a document, upload a PDF, send to a real (or your own) email, complete the signing, confirm objects appear in S3

If something fails, in priority order:

| Symptom | Where to look |
|---|---|
| Vercel build error | Vercel dashboard → Deployments → build logs |
| Webhook 401 | Clerk dashboard "Recent attempts" payload + `CLERK_WEBHOOK_SECRET` in Pulumi config |
| API 500 on first call | CloudWatch Logs → `/clinicsign/<stack>/api`, search the `requestId` |
| ECS task can't pull image | Wrong arch — rebuild with `--platform linux/amd64` |
| ECS task crashloops on boot | `env.ts` Zod parse error — print env keys in logs and compare |
| DB connection refused | RDS SG must allow `:5432` from ECS task SG (`pulumi up` re-applies) |

---

## Step 11 — Local API in Docker (optional)

Smoke test the Docker image without ECS:

```bash
npm run docker:api:build
npm run docker:api
# API on host port 4001 — point .env / API_URL accordingly
```

Postgres and S3 still come from **AWS** (Pulumi outputs), not from Compose.

---

## Cleanup when you're done

```bash
cd infra
AWS_PROFILE=clinicsign pulumi destroy
```

> **Warning**: `skipFinalSnapshot: true` is set on RDS for the dev stack. There is no recovery — snapshot manually first if you care about the data.

---

## Cost (order of magnitude)

- **NAT Gateway**: ~$32/mo flat + per-GB — biggest single line item
- **RDS** `db.t4g.micro` + storage: ~$15/mo
- **ALB + ECS Fargate** (1 task, 24/7): ~$30/mo combined
- **CloudFront / S3 / KMS / ECR / Logs**: usually < $5/mo total at demo scale

Use **billing alarms** and `pulumi destroy` what you don't need. See [`ARCHITECTURE.md` §12](./ARCHITECTURE.md#12-cost-shape-rough-dev-stack) for the breakdown.

---

## What this guide does *not* cover

- **Custom domain + ACM cert** for the API (CloudFront default cert is enough for the demo)
- **Verified SES domain** (Resend works in sandbox; SES is wired but not active)
- **Organization CloudTrail** to a separate write-only bucket
- **WAF** in front of CloudFront

These are listed in [`ARCHITECTURE.md` §11](./ARCHITECTURE.md#11-what-id-change-for-prod) as the prod path.

