# AWS + deployment setup for ClinicSign

**Target architecture:** **Vercel** hosts the Next.js app (`apps/web`). **AWS** hosts the API (Docker image in **ECR**, run on **ECS Fargate** behind an **ALB**, fronted by **CloudFront** for HTTPS), plus **RDS PostgreSQL**, **S3**, **KMS**, and **IAM** — provisioned via **Pulumi** under **`infra/`**.

Honest take: standing up AWS adds time on top of the app. Do it **after** Phase 1 works locally. Do not let infra block features.

## Decision tree

```
Is Phase 1 working end-to-end locally?
│
├── NO  → Finish Phase 1 first.
│
└── YES → Deploy
          │
          ├── Full path (below): Pulumi (`infra/`) + Vercel + API on AWS (ECR → ECS + ALB)
          └── No time to deploy?   Ship a local demo + README pointing at this guide.
```

---

## What you are building

```
┌─ Vercel ─────────────────────────┐
│  Next.js (apps/web)               │
└──────────────┬───────────────────┘
               │ HTTPS (NEXT_PUBLIC_API_URL)
               ▼
┌─ AWS ────────────────────────────┐
│  CloudFront (HTTPS)              │
│     ↓                            │
│  ALB (HTTP origin) → ECS Fargate │
│  RDS PostgreSQL, S3 (PDFs), KMS  │
│  IAM (app user from Pulumi outputs) │
└──────────────────────────────────┘
```

Pulumi provisions the full stack above. Your public API base URL is the **CloudFront** output `apiBaseUrl` (HTTPS), which you use for **Clerk webhooks** and your Vercel `NEXT_PUBLIC_API_URL`.

---

## Step 1: Create an AWS account (~15 min)

1. Open https://aws.amazon.com → Create an AWS account.
2. Credit card required; you pay for usage beyond free tier.
3. Choose **Basic Support – Free**.

### Do this immediately

1. **MFA on the root account** (Security credentials → MFA).
2. **Billing alarm** (e.g. **$5** or whatever cap you want): Billing → preferences → enable billing alerts; CloudWatch → alarm on estimated charges.
3. **Stop using root** for daily work — create an admin IAM user next.

### Optional: student / credits

Programs change; verify on official sites. Free Tier is limited (often **12 months** for many services). **NAT Gateway**, **RDS** size, **ALB/ECS** uptime, and **data transfer** can bill even at low traffic. **`pulumi destroy`** when experiments are done.

---

## Step 2: Admin IAM user (~10 min)

1. Root → **IAM** → **Users** → **Create user** (console access optional; programmatic access if you use CLI for Pulumi with this user).
2. Attach **AdministratorAccess** (or a narrower policy if you prefer for a demo account).
3. Save credentials in a password manager; enable **MFA** on this user.

You will use this identity for **`aws configure`** and **`pulumi up`**, not for the app at runtime.

---

## Step 3: AWS CLI (~5 min)

```bash
# macOS
brew install awscli

aws configure --profile clinicsign
# Access key + secret from admin (or automation) user
# Region: e.g. us-east-1
# Output: json

aws sts get-caller-identity --profile clinicsign
```

The **running API** uses the **Pulumi-created IAM user** keys from stack outputs (`iamAccessKeyId` / `iamSecretAccessKey`), not necessarily this admin profile.

---

## Step 4: Pulumi CLI (~10 min)

```bash
brew install pulumi/tap/pulumi   # or https://www.pulumi.com/docs/install/

pulumi login   # Pulumi Cloud (free for individuals) is easiest for state
```

---

## Step 5: Deploy infrastructure (this repo already has `infra/`)

Do **not** run `pulumi new` — the project ships **`infra/`** with `Pulumi.yaml`, `infra/src/index.ts`, etc.

```bash
cd infra
npm install

# Optional break-glass: allow laptop IP to connect to Postgres (normally DB is ECS-only)
# pulumi config set rdsAllowedCidr 203.0.113.45/32

AWS_PROFILE=clinicsign pulumi preview
AWS_PROFILE=clinicsign pulumi up
```

Retrieve outputs:

```bash
pulumi stack output --show-secrets
```

Map into the **repo root** `.env` (see **`.env.example`**). At minimum:

| Pulumi output | Env |
|---------------|-----|
| `databaseUrl` | `DATABASE_URL` |
| `s3BucketName` | `S3_BUCKET_NAME` |
| `iamAccessKeyId` | `AWS_ACCESS_KEY_ID` |
| `iamSecretAccessKey` | `AWS_SECRET_ACCESS_KEY` |
| `awsRegion` | `AWS_REGION` |

Do **not** set **`AWS_ENDPOINT_URL`** — the SDK must use real AWS endpoints.

Apply Prisma to RDS:

```bash
cd ../apps/api
npm run db:migrate
```

---

## Step 6: API container → ECR

`infra/` creates an **ECR** repository; build and push from the monorepo root (details in **`infra/README.md`**):

```bash
docker build -f apps/api/Dockerfile -t clinicsign-api:local .
aws ecr get-login-password --region <region> --profile clinicsign | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker tag clinicsign-api:local <ecrRepositoryUrl>:latest
docker push <ecrRepositoryUrl>:latest
```

Use the `ecrRepositoryUrl` output from Pulumi.

---

## Step 7: Run the API on AWS (ECS Fargate + ALB)

The infrastructure code provisions ECS/ALB/CloudFront, but the ECS task definition only hardcodes `PORT`.

You must provide the rest of your API env vars via Pulumi config:

- `apiEnv` (object): non-secret env vars
- `apiEnvSecret` (secret object): secrets (encrypted in Pulumi state)

Examples:

```bash
cd infra

# Non-secret
pulumi config set --path 'apiEnv.WEB_APP_URL' 'https://your-vercel-app.vercel.app'
pulumi config set --path 'apiEnv.LOG_LEVEL' 'info'
pulumi config set --path 'apiEnv.NODE_ENV' 'production'

# Secrets (examples only)
pulumi config set --secret --path 'apiEnvSecret.DATABASE_URL' "$(pulumi stack output databaseUrl --show-secrets)"
pulumi config set --secret --path 'apiEnvSecret.CLERK_SECRET_KEY' 'sk_live_...'
pulumi config set --secret --path 'apiEnvSecret.CLERK_WEBHOOK_SECRET' 'whsec_...'
pulumi config set --secret --path 'apiEnvSecret.JWT_SIGNING_SECRET' '...32+ chars...'

AWS_PROFILE=clinicsign pulumi up
```

Once the API task is healthy, use `apiBaseUrl` (CloudFront HTTPS) as the public API URL.

---

## Step 8: Frontend on Vercel (~15 min)

1. Import the GitHub repo on https://vercel.com.
2. **Root directory:** `apps/web` (monorepo).
3. Environment variables: Clerk keys, **`NEXT_PUBLIC_API_URL`** = public URL of your API (ALB or temporary URL).
4. Deploy.

Add your Vercel domain to Clerk’s allowed origins and CORS settings on the API if applicable.

Use Pulumi output `apiBaseUrl` as your API URL (HTTPS).

---

## Step 9: Verify end-to-end

1. Open the Vercel URL → sign in with Google (Clerk).
2. Confirm Clerk webhook deliveries hit your **HTTPS** API URL.
3. Create a document, upload a PDF, send, complete signing, confirm objects in **S3**.

If something fails: Vercel build logs, ECS task logs (CloudWatch), ALB target health, and API **Pino** logs.

---

## Step 10: Local API in Docker (optional)

Optional smoke test of the Docker image without ECS:

```bash
npm run docker:api:build
npm run docker:api
# API on host port 4001 — point `.env` / `API_URL` accordingly (see `.env.example`).
```

Postgres and S3 still come from **AWS** (Pulumi outputs), not from Compose.

---

## Cleanup when you are done

```bash
cd infra
AWS_PROFILE=clinicsign pulumi destroy
```

---

## Cost (order of magnitude)

- **RDS** `db.t4g.micro` + storage: often the largest **always-on** baseline besides optional **NAT** (when you add private subnets).
- **NAT Gateway**: hourly + processing — **not** free; design with **VPC endpoints** / single NAT where acceptable.
- **ALB + Fargate**: pay while provisioned.
- **S3 / KMS / ECR**: usually small for a demo.

Use **billing alarms** and **destroy** what you do not need.

---

## What reviewers should see

1. Root **`README.md`** explains setup and deploy shape.
2. **`infra/`** contains Pulumi TypeScript for AWS resources.
3. **`apps/api/Dockerfile`** is production-oriented.
4. Live **Vercel** URL + **HTTPS API** on AWS.
