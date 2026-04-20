# AWS + Infrastructure Setup Guide for ClinicSign

Honest take: this adds 3-5 hours of work on top of building the app. It's a HUGE differentiator for a take-home, but only do it AFTER your Phase 1 app works end-to-end locally. Do not let infra block features.

## The decision tree

```
Is Phase 1 working end-to-end locally?
│
├── NO  → Stop. Finish Phase 1 first. Come back to this.
│
└── YES → Continue
          │
          ├── Do you have 3+ hours left? → Full IaC path (AWS + Pulumi below)
          ├── Do you have 1-2 hours left? → Fast deploy path (Railway + S3 bucket)
          └── Less than 1 hour?           → Local demo only, mention deployment plan in README
```

---

## Path A: The Fast Deploy Path (1-2 hours)

If you're tight on time. Gets you a live app, minimum AWS exposure.

### Services:
- **Vercel**: frontend deploy (free, auto from GitHub)
- **Railway**: backend + Postgres deploy ($5 for a few days, Docker-based)
- **AWS S3**: one bucket for PDF storage (free tier)
- **AWS SES or Resend**: email (Resend is faster to set up)

### Steps:

1. Sign up for AWS, create IAM user with S3 access, create S3 bucket (instructions in Path B below, steps 1-4)
2. Sign up for Railway, connect your GitHub repo, select the backend Dockerfile
3. Sign up for Vercel, connect your GitHub repo, point it at `apps/web/`
4. Set env vars in both dashboards
5. Done

This is fine. Reviewers will see a working live app. It just lacks the "look how I think about infrastructure" moment.

---

## Path B: The Full IaC Path (3-5 hours) - RECOMMENDED

This is what makes the take-home shine. Gets you AWS + Pulumi + Docker fully wired.

### What we'll build

```
┌─ Vercel ────────────────────────┐
│  Next.js frontend                │
└───────────┬──────────────────────┘
            │ HTTPS
            ▼
┌─ Railway (Docker) ───────────────┐
│  Express backend (apps/api)      │
│  Postgres (Railway managed)      │
└───────────┬──────────────────────┘
            │ AWS SDK
            ▼
┌─ AWS (provisioned by Pulumi) ────┐
│  S3 bucket (KMS-encrypted)       │
│  IAM user + policy               │
│  SES identity                    │
│  KMS customer-managed key        │
└──────────────────────────────────┘
```

Backend on Railway because it's 10 minutes of work. AWS only for what AWS is uniquely good at (HIPAA-eligible storage and email). Pulumi codifies the AWS pieces.

Mention this explicitly in your README:

> "Backend is deployed on Railway (a managed Docker platform built on AWS) to meet the 2-day timeline. Infrastructure that touches PHI (S3 for PDFs, SES for email) is provisioned via Pulumi on AWS directly for the HIPAA-eligible services story. Migrating the backend to AWS ECS Fargate is a documented next step (see `infra/README.md`)."

Reviewers respect this kind of thinking way more than a half-broken all-AWS deploy.

---

## Step 1: Create AWS Account (15 minutes)

1. Go to https://aws.amazon.com and click "Create an AWS Account"
2. Enter email, choose an account name like "clinicsign-prasad"
3. Enter credit card (required, but free tier covers everything we'll do)
4. Verify phone number
5. Choose "Basic Support - Free" plan

### Critical security setup IMMEDIATELY after creating account

These are non-negotiable. Skipping them risks a bill of thousands of dollars if someone gets your root password:

1. **Enable MFA on root account**
   - Sign in as root
   - Top-right dropdown → Security Credentials
   - "Multi-factor authentication (MFA)" → Assign MFA device
   - Use Google Authenticator / Authy on your phone
   - Scan QR, enter two consecutive codes

2. **Set up a billing alarm at $5**
   - Top-right → Billing and Cost Management
   - Left sidebar → Billing Preferences
   - Enable "Receive AWS Free Tier Usage Alerts"
   - Enable "Receive Billing Alerts"
   - Then go to CloudWatch → Alarms → Create alarm
   - Metric: "Billing" → "Total Estimated Charge" with Currency=USD
   - Threshold: Static, Greater than, 5 USD
   - Email yourself if it trips
   - Name: "billing-alert-5usd"

3. **Do not use root account for anything else.** Create an admin IAM user next, use it for all work.

---

## Step 2: Create Admin IAM User (10 minutes)

1. Sign in as root
2. Go to IAM → Users → Create user
3. Username: `admin-prasad` (or similar)
4. Check "Provide user access to the AWS Management Console"
5. Choose "I want to create an IAM user" (not Identity Center for this demo)
6. Auto-generated password, you'll reset on first login
7. Next → Permissions
8. "Attach policies directly" → Search and select `AdministratorAccess`
9. Next → Create user
10. **Save the console login URL + username + password** to a password manager immediately
11. Log out of root, log in as this new admin user for all subsequent work

Also enable MFA on this admin user, same process as root.

---

## Step 3: Create IAM User for ClinicSign App (10 minutes)

This is the user the app will use to upload to S3 and send emails. Scoped permissions, not admin.

1. As admin, go to IAM → Users → Create user
2. Username: `clinicsign-app`
3. Do NOT check "Provide console access" (this is a programmatic user, API only)
4. Next → Permissions → "Attach policies directly"
5. For now, attach `AmazonS3FullAccess` and `AmazonSESFullAccess` (we'll tighten these later via Pulumi)
6. Create user
7. Click into the newly created user → Security credentials tab
8. Click "Create access key"
9. Use case: "Application running outside AWS"
10. Skip the "Alternative recommended" warning (it's fine for a demo)
11. **Save the Access Key ID and Secret Access Key** - you only see the secret ONCE, save it immediately
12. Download the .csv with credentials

Put these in your local `.env` file like:
```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

**NEVER commit these to git.** The `.gitignore` already ignores `.env`, verify it does.

---

## Step 4: Install AWS CLI and Verify (5 minutes)

```bash
# macOS
brew install awscli

# Linux
sudo apt install awscli

# Windows (use Git Bash)
# Download installer from https://awscli.amazonaws.com/AWSCLIV2.msi

# Configure with the clinicsign-app credentials
aws configure --profile clinicsign
# Enter the Access Key ID
# Enter the Secret Access Key
# Default region: us-east-1
# Default output: json

# Verify
aws s3 ls --profile clinicsign
# Should return nothing (no buckets yet) without error
```

---

## Step 5: Install Pulumi (10 minutes)

```bash
# macOS
brew install pulumi/tap/pulumi

# Linux
curl -fsSL https://get.pulumi.com | sh

# Windows
# Follow instructions at https://www.pulumi.com/docs/install/

# Verify
pulumi version
```

Create a free Pulumi Cloud account for state storage:

```bash
pulumi login
# Opens browser, sign in with GitHub
```

State can also be stored in S3 or locally, but Pulumi Cloud is free for individuals and easiest. Reviewer doesn't need a Pulumi account to read your code.

---

## Step 6: Set Up the Pulumi Project (15 minutes)

From the repo root:

```bash
mkdir -p infra
cd infra

pulumi new aws-typescript \
  --name clinicsign-infra \
  --description "Infrastructure for ClinicSign: S3, KMS, SES, IAM" \
  --stack dev \
  --force

# It will ask:
# - AWS region: us-east-1
```

This creates:
- `infra/Pulumi.yaml` - project config
- `infra/Pulumi.dev.yaml` - stack config
- `infra/index.ts` - starter code (you'll replace this)
- `infra/package.json` - dependencies
- `infra/tsconfig.json`

Use the actual infrastructure code from the bundle (`infra/src/index.ts`). It defines:
- Encrypted S3 bucket with block-public-access
- KMS customer-managed key for S3 encryption
- IAM user with least-privilege policy (ONLY the permissions the app actually needs)
- SES domain identity (optional, if you have a domain; else skip)

Commit the infra folder:
```bash
git add infra/
git commit -m "chore(infra): pulumi scaffolding for aws resources"
```

**Add to `.gitignore`:**
```
# Pulumi
infra/node_modules/
infra/Pulumi.*.yaml.bak
```

DO commit `Pulumi.yaml` and `Pulumi.dev.yaml`. DO NOT commit your Pulumi access token.

---

## Step 7: Deploy with Pulumi (15 minutes)

From `infra/`:

```bash
# Install deps
npm install

# Preview what will be created
pulumi preview

# Apply
pulumi up
# It asks "Do you want to perform this update?" → yes

# If it succeeds, it prints the outputs:
# s3BucketName: "clinicsign-documents-xxx"
# kmsKeyArn: "arn:aws:kms:us-east-1:..."
# iamAccessKeyId: "AKIA..."
# iamSecretAccessKey: [secret]

# View outputs any time
pulumi stack output --show-secrets
```

Take the outputs and put them in your app's `.env`:
```
S3_BUCKET_NAME=clinicsign-documents-xxx
KMS_KEY_ID=arn:aws:kms:...
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

Now the app uses infrastructure that Pulumi provisioned. Anyone who clones the repo can run `pulumi up` and get identical infrastructure.

To destroy everything later (cleanup):
```bash
pulumi destroy
```

---

## Step 8: Dockerize the Backend (30 minutes)

This is already covered in `CURSOR_PROMPTS.md` P1.12, but here's the concrete Dockerfile you'll use. Use the template in the bundle at `apps/api/Dockerfile`.

Key points:
- Multi-stage build (small final image)
- Runs as non-root user
- Health check baked in
- Uses `tini` as PID 1 for proper signal handling
- Node.js 20 alpine base

Test locally:
```bash
cd apps/api
docker build -t clinicsign-api .
docker run -p 4000:4000 --env-file .env clinicsign-api
# Should start, hit http://localhost:4000/health
```

---

## Step 9: Deploy Backend to Railway (15 minutes)

1. Sign up at https://railway.app with GitHub
2. New Project → Deploy from GitHub repo → Choose `clinicsign`
3. Railway detects the Dockerfile in `apps/api/` automatically
4. It will try to deploy and fail because env vars are missing. That's fine
5. Go to the service → Variables tab
6. Add all env vars from your local `.env`:
   - `DATABASE_URL` (Railway will provide this when you add Postgres)
   - `CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `CLERK_WEBHOOK_SECRET`
   - `JWT_SIGNING_SECRET` (generate with `openssl rand -base64 32`)
   - `AWS_REGION=us-east-1`
   - `AWS_ACCESS_KEY_ID` (from Pulumi output)
   - `AWS_SECRET_ACCESS_KEY`
   - `S3_BUCKET_NAME`
   - `EMAIL_FROM` (verified SES email or Resend-allowed)
   - `RESEND_API_KEY` (if using Resend for dev)
   - `WEB_APP_URL=https://your-vercel-url.vercel.app`
   - `NODE_ENV=production`
   - `LOG_LEVEL=info`
   - `PORT=4000`
7. Add Postgres: New → Database → PostgreSQL. Railway gives you a `DATABASE_URL` var automatically
8. Redeploy. Railway auto-runs Prisma migrations if you have a start script like `prisma migrate deploy && node dist/server.js`

---

## Step 10: Deploy Frontend to Vercel (10 minutes)

1. Sign up at https://vercel.com with GitHub
2. Import project → select `clinicsign`
3. Root directory: `apps/web`
4. Framework: Next.js (auto-detected)
5. Environment variables:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_API_URL=https://your-railway-backend-url.up.railway.app`
6. Deploy

Now update CLERK_WEBHOOK_SECRET: in Clerk dashboard, create a webhook endpoint pointing to `https://your-railway-backend-url.up.railway.app/api/webhooks/clerk`. Copy the Svix signing secret. Update `CLERK_WEBHOOK_SECRET` in Railway env vars. Redeploy.

Also update Clerk allowed origins to include your Vercel URL.

---

## Step 11: Verify Live End-to-End (15 minutes)

1. Visit your Vercel URL
2. Sign in with Google
3. Verify Clerk webhook fires → check Railway logs, look for user sync
4. Create a document, upload PDF
5. Send to a real email address
6. Open email in incognito browser, click the link
7. Sign the document
8. Verify signed PDF in S3 (console → S3 → your bucket)

If anything breaks, the Railway logs will show you what happened. Most common issues:
- CORS: add Vercel URL to CORS origins in backend
- Clerk webhook signature mismatch: wrong webhook secret
- S3 upload fails: IAM policy too restrictive

---

## What Reviewers Will See

When a senior engineer clones your repo:

1. `README.md` at root explains the architecture with a diagram
2. `infra/` has commented TypeScript code defining AWS resources
3. `apps/api/Dockerfile` shows multi-stage build with security best practices
4. `CURSOR_PROMPTS.md` documents your phased build approach
5. Live URLs work
6. They can run `cd infra && pulumi up` to recreate your infrastructure from scratch

This is infrastructure maturity above most take-home submissions. Stand out.

---

## Common Mistakes to Avoid

- Don't try full AWS ECS Fargate. Too much YAML for too little additional value. Railway + S3 is the sweet spot.
- Don't forget to set the billing alarm. Seriously. $53,000 bills have happened.
- Don't commit .env files or Pulumi secrets. Verify .gitignore.
- Don't use the root AWS account for anything. Admin IAM user for ops, programmatic IAM user for the app.
- Don't skip MFA. On root AND on admin user.
- Don't paste your Pulumi outputs (secrets) into Slack, Discord, or any chat. Put them directly in env vars.

---

## Cleanup When You're Done With the Take-Home

AWS resources cost money even when idle. When you don't need the demo live anymore:

```bash
# Destroy AWS resources
cd infra
pulumi destroy

# Delete Railway project (in Railway dashboard)
# Delete Vercel project (in Vercel dashboard)
# Optionally delete AWS IAM users + stop root MFA device
```

The demo video is preserved forever even after infrastructure is destroyed.

---

## Cost Estimate

For a 1-week demo:
- AWS: $0-2 (well within free tier for S3 + SES)
- Railway: $5 signup credit covers first few days, then ~$5/month
- Vercel: $0 (free tier)
- Clerk: $0 (free tier)
- Anthropic API: $2-5 if using AI features in Phase 2

Total for the take-home: under $10. Stop infrastructure when done to avoid ongoing charges.
