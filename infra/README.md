# ClinicSign Infrastructure

AWS infrastructure for ClinicSign (Pulumi + TypeScript). **Deploy story:** **Vercel** = web; **AWS** = API (ECS Fargate behind ALB, fronted by CloudFront for HTTPS), RDS, S3 — see [`AWS_SETUP_GUIDE.md`](./AWS_SETUP_GUIDE.md).

## What this provisions

- **VPC** (`10.42.0.0/16`) with two **public subnets** (ALB + NAT) and two **private subnets** (ECS tasks + RDS)
- **NAT Gateway** (egress for private subnets: ECR pulls, CloudWatch Logs, etc.)
- **RDS PostgreSQL 16** (`db.t4g.micro`, 20 GB gp3, **storage encrypted**, automated backups 7 days), **private** (not publicly accessible)
- **RDS master password** from Pulumi (`@pulumi/random`), exported as **`databaseUrl`** (secret)
- **KMS** customer-managed key (rotation enabled)
- **S3** PDF bucket: KMS-encrypted, versioned, public access blocked, lifecycle rules
- **ECR** repository `clinicsign-{stack}-api` for the API image
- **ECS Fargate service** running the API in **private subnets**
- **Application Load Balancer** in **public subnets** (origin for CloudFront)
- **CloudFront distribution** in front of ALB to provide an **HTTPS** API URL (works without a custom domain; required for Clerk webhooks)
- **IAM user** `clinicsign-app-{stack}` (S3 + SES + KMS as needed) + access key outputs

The app database is **RDS** only (no local Postgres service in-repo).

## RDS access control

By default, RDS allows PostgreSQL (5432) **only from the ECS task security group**.

If you need **break-glass** access from your laptop (e.g. debugging), set `rdsAllowedCidr` explicitly to your public IP `/32`:

```bash
pulumi config set rdsAllowedCidr 203.0.113.45/32
AWS_PROFILE=clinicsign pulumi up
```

Use your current public IPv4 with `/32`.

## Why these choices

### HIPAA architecture considerations

- All AWS services used here are HIPAA-eligible
- PHI in S3 encrypted at rest with a customer-managed KMS key
- RDS storage encryption enabled at create time
- Key rotation enabled (KMS)

### IAM least-privilege

The app IAM user is scoped to this stack’s bucket, KMS key, and SES send actions only.

## Setup

### Prerequisites

1. AWS account with IAM admin user (not root)
2. AWS CLI configured: `aws configure --profile clinicsign`
3. Pulumi CLI installed: https://www.pulumi.com/docs/install/
4. Pulumi Cloud account (free): `pulumi login`

### Deploy

```bash
cd infra
npm install

AWS_PROFILE=clinicsign pulumi preview
AWS_PROFILE=clinicsign pulumi up
```

### Configure ECS task environment (required for API to run on AWS)

The ECS task definition only hardcodes `PORT`. Everything else (Clerk keys, `DATABASE_URL`, etc.) must be provided via Pulumi config:

- **Non-secret env vars**: `apiEnv` (object)
- **Secret env vars**: `apiEnvSecret` (secret object, encrypted in Pulumi state)

Examples (fill with your real values; do not paste secrets into git):

```bash
# Non-secret
pulumi config set --path 'apiEnv.WEB_APP_URL' 'https://your-vercel-app.vercel.app'
pulumi config set --path 'apiEnv.LOG_LEVEL' 'info'
pulumi config set --path 'apiEnv.NODE_ENV' 'production'

# Secrets
pulumi config set --secret --path 'apiEnvSecret.DATABASE_URL' "$(pulumi stack output databaseUrl --show-secrets)"
pulumi config set --secret --path 'apiEnvSecret.CLERK_SECRET_KEY' 'sk_live_...'
pulumi config set --secret --path 'apiEnvSecret.CLERK_WEBHOOK_SECRET' 'whsec_...'
pulumi config set --secret --path 'apiEnvSecret.JWT_SIGNING_SECRET' '...32+ chars...'
```

Then run `pulumi up` again to roll a new task definition.

### Retrieve outputs for app config

```bash
pulumi stack output --show-secrets
```

Copy at minimum into the **repo root `.env`**:

| Output | Env var |
|--------|---------|
| `databaseUrl` | `DATABASE_URL` |
| `s3BucketName` | `S3_BUCKET_NAME` |
| `iamAccessKeyId` | `AWS_ACCESS_KEY_ID` |
| `iamSecretAccessKey` | `AWS_SECRET_ACCESS_KEY` |
| `awsRegion` | `AWS_REGION` |

Do **not** set `AWS_ENDPOINT_URL` — the app targets real AWS endpoints.

Then apply Prisma migrations against RDS:

```bash
cd ../apps/api
npm run db:migrate
```

### Push API image to ECR

From monorepo root:

```bash
docker build -f apps/api/Dockerfile -t clinicsign-api:local .
aws ecr get-login-password --region <region> --profile clinicsign | docker login --username AWS --password-stdin <ecr host>
docker tag clinicsign-api:local <ecrRepositoryUrl>:latest
docker push <ecrRepositoryUrl>:latest
```

Use the `ecrRepositoryUrl` stack output.

### Public API URL (HTTPS)

After `pulumi up`, the stack outputs:

- `apiBaseUrl`: `https://<cloudfront-domain>` (**use this for Clerk webhooks + Vercel API base URL**)
- `albDnsName`: ALB origin DNS (HTTP)

### Destroy

```bash
AWS_PROFILE=clinicsign pulumi destroy
```

RDS final snapshot: the stack uses `skipFinalSnapshot: true` for dev — **do not rely on this in production**.

## Stack management

Default stack is `dev`. For production:

```bash
pulumi stack init prod
pulumi config set aws:region us-east-1
AWS_PROFILE=clinicsign pulumi up --stack prod
```

Consider stricter networking (private RDS, ECS-only access) before real PHI.

## What this does NOT provision (yet)

- **Route 53**, **custom domain + ACM cert** — optional if you want a branded API domain instead of CloudFront’s domain
- **Verified SES domain** — recommended for deliverability when you own a domain
- **Organization CloudTrail** — separate org/policy concern

## Cost estimate (order of magnitude)

- RDS `db.t4g.micro`: ~\$12–15/month + storage
- S3/KMS/ECR: often within free tiers for light use
- Data transfer: varies

Destroy stacks you are not using.

## Security notes

- Never commit `.pulumi/` or `.env`
- Rotate IAM access keys periodically; prefer **ECS task roles** instead of long-lived keys in prod
- The Pulumi admin is separate from the app IAM user
