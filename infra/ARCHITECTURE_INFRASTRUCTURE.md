# ClinicSign — infrastructure reference

**Canonical setup:** [`README.md`](./README.md) · **Account + deploy path:** [`AWS_SETUP_GUIDE.md`](./AWS_SETUP_GUIDE.md).

This note captures the **intended production shape** and how the **current Pulumi stack** relates to it. It is not a second source of truth for commands — use **`infra/README.md`** for outputs, `pulumi` commands, and what is (or is not) in code today.

---

## Target architecture (Vercel + AWS)

| Layer | Choice |
|--------|--------|
| **Web** | **Vercel** — `apps/web` (Next.js). |
| **API** | **AWS** — container image in **ECR**, run on **ECS Fargate** behind an **Application Load Balancer** (HTTPS). |
| **Database** | **RDS PostgreSQL** — encrypted storage; security group allows Postgres only from the API (or from your IP during dev). |
| **Files** | **S3** — KMS-encrypted objects; app uses IAM credentials (Pulumi-created user today; **ECS task role** in production). |
| **Email** | **Resend** in dev; **SES** in production with verified domain. |

**Current Pulumi code** (`infra/src/index.ts`) provisions VPC, **public** subnets + **internet gateway**, **RDS** (publicly reachable for laptop dev), S3, KMS, IAM app user, **ECR**. It does **not** yet provision ECS, ALB, or NAT — add those when you move the API fully onto AWS and tighten RDS to **private subnets** + ECS-only SG rules.

---

## Principles to keep (from classic “three-tier” AWS patterns)

1. **Database not on the public internet in production** — RDS in **private subnets**; **no** `publiclyAccessible` for real PHI. Access only from the **ECS task security group** on port **5432** (and **bastion** or **SSM** if operators need shell access — optional).
2. **Load balancer is the only public ingress for the API** — Internet → **ALB** (TLS) → ECS tasks in **private** subnets. No SSH to tasks for normal operation.
3. **Layered security groups** — e.g. ALB SG allows **443** from `0.0.0.0/0`; ECS task SG allows **traffic only from ALB SG** on the app port; RDS SG allows **5432** only from ECS task SG.
4. **Egress from private subnets** — Tasks need outbound access for ECR image pulls, Secrets Manager, optional **SES**/**S3** APIs. Options: **NAT Gateway** (hourly cost) or **VPC endpoints** where they reduce NAT traffic/cost.

---

## Dev vs prod (this repo)

| Concern | Dev (today’s template) | Prod direction |
|---------|-------------------------|----------------|
| RDS placement | Public subnets + optional `rdsAllowedCidr` for your IP | Private subnets; SG: Postgres **from ECS SG only** |
| API | Local `npm run dev` or Docker → same VPC later via ECS | ECS Fargate + ALB |
| IAM keys in env | Pulumi-output access keys | Prefer **ECS task role** + **Secrets Manager** |

---

## Cost levers (short)

- **NAT Gateway** — usually a fixed monthly line item if always on; **VPC endpoints** for S3/ECR/Secrets can help **reduce** NAT traffic.
- **RDS** — smallest instance class that meets latency; single-AZ for demo.
- **ALB + Fargate** — billed while provisioned; scale tasks to zero only if your pattern allows it (often one small task for demos).
- **Destroy** experimental stacks: `pulumi destroy` in `infra/`.

---

## Related docs

- **`infra/README.md`** — exact resources, outputs, ECR push, `pulumi destroy`.
- **`infra/AWS_SETUP_GUIDE.md`** — AWS account, Pulumi, Vercel, ECS wiring expectations.
- **`PROJECT.md`** — product schema, HIPAA-minded technical notes.
