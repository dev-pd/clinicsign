# `infra/` — ClinicSign infrastructure

Pulumi (TypeScript) program that provisions everything ClinicSign runs on inside AWS: VPC + subnets, RDS PostgreSQL, S3, KMS, ECR, IAM, ECS Fargate, ALB, CloudFront.

This README is a 30-second index. The two real docs are:

| File | Read when |
|---|---|
| **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** | You want to understand *what* runs where, the trust boundaries, the IAM scopes, the production tradeoffs |
| **[`AWS_SETUP_GUIDE.md`](./AWS_SETUP_GUIDE.md)** | You want to deploy from zero — account → Pulumi → ECR → Vercel → first sign-and-send |

---

## What this provisions

- **VPC** `10.42.0.0/16`, 2 public + 2 private subnets, NAT Gateway
- **ECS Fargate** API service in private subnets, no public IP
- **ALB** in public subnets, HTTP `:80` (TLS terminates at CloudFront)
- **CloudFront** distribution → ALB origin (free TLS via `*.cloudfront.net`)
- **RDS PostgreSQL 16**, `db.t4g.micro`, private, KMS-encrypted, 7-day backups
- **S3** documents bucket: KMS-encrypted, versioned, public access blocked, lifecycle rules
- **KMS** customer-managed key (rotation on)
- **ECR** repo with scan-on-push and 5-image retention
- **IAM** ECS task role (S3 + KMS + SES least-privilege) + execution role + legacy app user
- **CloudWatch Logs** group, 14-day retention

The app database is **RDS** only. There is no local Postgres in-repo.

---

## Stack outputs

After `pulumi up`, get them with `pulumi stack output --show-secrets`:

| Output | Maps to |
|---|---|
| `apiBaseUrl` | Vercel `NEXT_PUBLIC_API_URL` and Clerk webhook URL |
| `databaseUrl` | repo `.env` `DATABASE_URL` |
| `s3BucketName` | `S3_BUCKET_NAME` |
| `iamAccessKeyId` / `iamSecretAccessKey` | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` |
| `awsRegion` | `AWS_REGION` |
| `ecrRepositoryUrl` | `docker push` target |
| `albDnsName` | debugging only |

---

## Deploy / destroy

Use the same AWS credential resolution as **`AWS_SETUP_GUIDE.md`** Step 3 (`export AWS_PROFILE=…` when you use a named profile; omit when **`[default]`** is enough).

```bash
cd infra
npm install

pulumi preview
pulumi up

# Tear down everything (RDS data is lost — dev stack uses skipFinalSnapshot)
pulumi destroy
```

For **API image → ECR → ECS rollout**, use **`npm run deploy:ecs`** from the **repo root** — see **[AWS_SETUP_GUIDE § Step 6](./AWS_SETUP_GUIDE.md#step-6--push-the-api-image-to-ecr-and-roll-ecs)**.

Full walkthrough including ECS env-var injection: **[`AWS_SETUP_GUIDE.md`](./AWS_SETUP_GUIDE.md)**.

---

## Stacks

Default is `dev`. For prod:

```bash
pulumi stack init prod
pulumi config set aws:region us-east-1
pulumi up --stack prod
```

Tighten before any real PHI: drop `rdsAllowedCidr`, drop the legacy IAM user in favor of the task role, switch to Secrets Manager, multi-AZ NAT + `desiredCount ≥ 2`. See **[`ARCHITECTURE.md` §11](./ARCHITECTURE.md#11-what-id-change-for-prod)**.

---

## Security notes

- Never commit `.pulumi/` or `.env`
- The Pulumi admin identity is separate from the app IAM user — keep it that way
- Rotate IAM access keys periodically; in prod, drop the IAM user and let the SDK pick up the ECS task role automatically
