# ClinicSign Infrastructure

AWS infrastructure for ClinicSign provisioned via Pulumi (TypeScript).

**End-to-end AWS account setup, deploy paths, and timelines:** see [`AWS_SETUP_GUIDE.md`](./AWS_SETUP_GUIDE.md).

## What this provisions

- **KMS customer-managed key** for PHI encryption (with annual rotation)
- **S3 bucket** for PDF storage: KMS-encrypted, versioned, public access blocked, lifecycle rules for draft cleanup and archive transition
- **IAM user** `clinicsign-app-{stack}` with least-privilege policies scoped to only the actions the app needs on only the resources it owns
- **Access key** for the IAM user (stored as a Pulumi secret)

## Why these choices

### HIPAA architecture considerations
- All AWS services used here are HIPAA-eligible
- PHI in S3 encrypted at rest with a customer-managed KMS key (not the AWS-managed `aws/s3` key)
- Key rotation enabled
- All public access blocked at the bucket level via `BucketPublicAccessBlock`
- Access is via presigned URLs only, generated server-side with short TTL

### IAM least-privilege
The IAM user has EXACTLY these permissions and nothing more:
- `s3:ListBucket` on the bucket ARN
- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the bucket objects ARN
- `kms:Decrypt`, `kms:Encrypt`, `kms:GenerateDataKey`, `kms:ReEncryptFrom/To` on the KMS key
- `ses:SendEmail`, `ses:SendRawEmail` (scoped by verified identity in SES)

If the app key leaks, the blast radius is limited to this bucket and SES sends. No access to other AWS resources.

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

# Preview what will change
AWS_PROFILE=clinicsign pulumi preview

# Apply
AWS_PROFILE=clinicsign pulumi up
```

### Retrieve outputs for app config

```bash
pulumi stack output --show-secrets
```

Copy these into your app's `.env`:

```
S3_BUCKET_NAME=<s3BucketName output>
KMS_KEY_ID=<kmsKeyArn output>
AWS_ACCESS_KEY_ID=<iamAccessKeyId output>
AWS_SECRET_ACCESS_KEY=<iamSecretAccessKey output>
AWS_REGION=<awsRegion output>
```

### Destroy

```bash
AWS_PROFILE=clinicsign pulumi destroy
```

## Stack management

Default stack is `dev`. For a production stack:

```bash
pulumi stack init prod
pulumi config set aws:region us-east-1
AWS_PROFILE=clinicsign pulumi up --stack prod
```

Each stack gets isolated resources with environment-specific names.

## What this does NOT provision

- RDS database: we use Railway's managed Postgres for speed. For production, we'd add an RDS Postgres instance here with Multi-AZ, encryption, backups.
- ECS/Fargate for backend: we use Railway for the take-home timeline. Production would run backend on ECS Fargate behind an ALB in private subnets.
- VPC: no custom VPC yet. Production would have a VPC with private subnets for RDS + ECS, public subnet for ALB, NAT Gateway for outbound.
- CloudFront: frontend is on Vercel. Production might front everything with CloudFront for unified logging.
- CloudTrail: should be enabled for HIPAA audit. Currently relying on AWS default.

These are documented as "next steps" in the top-level README.

## Cost estimate

Running the stack for a week costs approximately:
- S3: $0 (well within free tier: 5 GB, 20K GET, 2K PUT)
- KMS: $1/month per key
- IAM: free
- SES: $0 (62K emails/month free)

Total: ~$1/month. Destroy when done to avoid recurring cost.

## Security notes

- Never commit `.pulumi/` directory (it's in `.gitignore`)
- Never commit access keys. The Pulumi-generated secret is stored encrypted in Pulumi Cloud state
- Rotate the IAM user access key every 90 days. Pulumi can do this by tainting the resource: `pulumi up --replace 'aws:iam/accessKey:AccessKey::clinicsign-app-access-key'`
- The admin user that runs Pulumi is separate from the app user. The app user has no IAM permissions.
