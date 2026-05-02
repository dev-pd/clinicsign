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

Install the CLI and store your **admin** access key under a **named profile**. The profile label is **whatever you choose** in `aws configure --profile …` — it does **not** have to match your IAM username, account nickname, or the project name. Older examples used `clinicsign` as a placeholder only.

```bash
brew install awscli                 # macOS

aws configure list-profiles        # see what already exists (may be empty)

# Pick any profile name, e.g. pd-clinicsign or default-admin
aws configure --profile YOUR_PROFILE_NAME
# Access key + secret from the admin IAM user
# Default region: same as Pulumi (e.g. us-east-1)
# Output format: json

aws sts get-caller-identity --profile YOUR_PROFILE_NAME
```

Use that profile for **Pulumi**, **ECR login**, and **`npm run deploy:ecs`**:

- Per command: `AWS_PROFILE=YOUR_PROFILE_NAME pulumi up`
- Or one shell session: `export AWS_PROFILE=YOUR_PROFILE_NAME`

If you only use **`[default]`** credentials (`aws configure` without `--profile`) and `aws sts get-caller-identity` works with no env vars, you can leave **`AWS_PROFILE` unset** — **`npm run deploy:ecs`** still works.

The **running API** uses the **Pulumi-created IAM user** keys injected into the ECS task (`iamAccessKeyId` / `iamSecretAccessKey` outputs), **not** this admin CLI profile.

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

# Ensure credentials resolve (see Step 3): e.g. export AWS_PROFILE=YOUR_PROFILE_NAME
pulumi preview
pulumi up
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

## Step 6 — Push the API image to ECR and roll ECS

**Preferred:** from **monorepo root**, with Docker running:

```bash
# Optional if you use a named profile (Step 3):
export AWS_PROFILE=YOUR_PROFILE_NAME

npm run deploy:ecs
```

That runs **[`scripts/deploy-api-ecs.sh`](../scripts/deploy-api-ecs.sh)** against the **currently selected Pulumi stack** in `infra/`: resolves **`ecrRepositoryUrl`** and **`awsRegion`**, logs in to ECR, **`docker buildx build --platform linux/amd64`** (required on Apple silicon), pushes **`:latest`**, then **`aws ecs update-service --force-new-deployment`** on **`clinicsign-<stack>-api`** (e.g. dev → **`clinicsign-dev`** / **`clinicsign-dev-api`**).

On ECS, the task definition **`command`** runs **`prisma migrate deploy`** then **`node`** (see **`infra/src/index.ts`**). The API [`Dockerfile`](../apps/api/Dockerfile) uses the same startup **`CMD`** so a plain **`docker run`** (no command override) matches that behavior.

**Manual equivalent** (same outcome):

```bash
# export AWS_PROFILE=YOUR_PROFILE_NAME   # when not using [default]

cd infra
ECR_URL=$(pulumi stack output ecrRepositoryUrl)
REGION=$(pulumi stack output awsRegion)

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ECR_URL"

cd ..
docker buildx build --platform linux/amd64 \
  -t "$ECR_URL:latest" \
  -f apps/api/Dockerfile . --push

STACK=$(cd infra && pulumi stack --show-name)
aws ecs update-service \
  --cluster "clinicsign-${STACK}" \
  --service "clinicsign-${STACK}-api" \
  --region "$REGION" \
  --force-new-deployment
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

pulumi up    # re-renders task definition; uses AWS creds from Step 3 (e.g. AWS_PROFILE)
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
# export AWS_PROFILE=... if required (Step 3)
pulumi destroy
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

