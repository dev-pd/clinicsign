# ClinicSign — Infrastructure deep dive

> Companion to [`infra/README.md`](./infra/README.md) and [`infra/ARCHITECTURE_INFRASTRUCTURE.md`](./infra/ARCHITECTURE_INFRASTRUCTURE.md).
> Those are operational. **This one is for studying** — every resource, why
> it exists, how it's wired, and where the trust boundaries are. Source of
> truth is `infra/src/index.ts`; line numbers below refer to that file.

---

## 0. TL;DR

- **Frontend** (`apps/web`, Next.js) ships to **Vercel**.
- **Backend** (`apps/api`, Node/Express + Prisma) runs on **AWS ECS Fargate**
  in private subnets, behind an **ALB** in public subnets, fronted by
  **CloudFront** (HTTPS termination + free TLS cert).
- **State** lives in **RDS PostgreSQL** (private, no public IP) and **S3**
  (private, KMS‑encrypted). Both encrypt at rest under the same
  customer‑managed **KMS** key.
- One **Pulumi** program (`infra/`) provisions everything. Pulumi state
  lives in the cloud backend you logged into; secrets are encrypted in
  that state.
- **Auth**: providers use Clerk; patients hold a 256‑bit signing token
  (raw in URL, SHA‑256 hash in DB).
- **Email**: outbound transactional via Resend (SES is wired but not
  the active path).

---

## 1. The picture

```
                          (browser, anyone on the internet)
                                       │  HTTPS
                                       ▼
                                  Vercel CDN
                                  apps/web (Next.js)
                                       │  HTTPS to API
                                       ▼
                              CloudFront distribution
                              ─ TLS (default cf cert)
                              ─ Managed-CachingDisabled
                              ─ Managed-AllViewer (forwards everything)
                                       │  HTTP :80, http-only origin
                                       ▼
                       ┌───────────────────────────────┐
                       │  VPC 10.42.0.0/16 (us-east-1) │
                       │                               │
                       │   Public subnets (2 AZs)      │
                       │   ┌─────────┐  ┌──────────┐   │
                       │   │  ALB    │  │ NAT GW   │   │
                       │   │  :80    │  │ + EIP    │   │
                       │   └────┬────┘  └────▲─────┘   │
                       │        │            │         │
                       │        ▼            │ egress  │
                       │   Private subnets (2 AZs)     │
                       │   ┌──────────────────────┐    │
                       │   │ ECS Fargate task     │    │
                       │   │ apps/api :4000       │    │
                       │   └──────┬──────────┬────┘    │
                       │          │          │         │
                       │          │5432      │  s3     │
                       │          ▼          ▼         │
                       │   ┌────────────┐ (gateway     │
                       │   │ RDS pg-16  │  endpoint    │
                       │   │ private    │  not yet:    │
                       │   └────────────┘  S3 via NAT) │
                       └───────────────────────────────┘

                                   │
                                   ▼
                      AWS account (regional services)
                      KMS CMK ─ encrypts S3 + RDS at rest
                      S3       ─ versioned, public access blocked
                      ECR      ─ stores api images
                      CW Logs  ─ /clinicsign/<stack>/api
                      IAM      ─ exec role + task role + (legacy) app user

                      Off-AWS:
                      Clerk    ─ provider auth + webhook -> /api/webhooks/clerk
                      Resend   ─ outbound email (HTTPS, via NAT egress)
```

The only things that listen on the public internet are:
- the Vercel-hosted Next.js app,
- CloudFront (HTTPS),
- the ALB (HTTP :80, but only reachable through CloudFront in practice),
- the NAT Gateway (egress only — not a listener).

Everything else (ECS, RDS, S3, KMS) is private or AWS-internal.

---

## 2. Stack config the program reads (`infra/src/index.ts:39-51`)

```ts
const stack            = pulumi.getStack();      // "dev", "prod", ...
const rdsAllowedCidr   = config.get("rdsAllowedCidr");          // optional
const apiContainerPort = config.getNumber("apiContainerPort") ?? 4000;
const apiEnv           = config.getObject<...>("apiEnv") ?? {}; // plain
const apiEnvSecret     = config.getSecretObject<...>("apiEnvSecret"); // encrypted
```

**What goes where:**

| Pulumi config key | Sensitive? | Becomes |
|---|---|---|
| `rdsAllowedCidr` | no | optional 5432 ingress (laptop break-glass) |
| `apiContainerPort` | no | container port + ALB target port |
| `apiEnv.*` | no | plain env vars in the ECS task definition |
| `apiEnvSecret.*` | **yes** | encrypted in Pulumi state, injected into the task definition as plain env (not via Secrets Manager — yet) |

> **Trade-off, written down honestly.** Today secrets sit in the rendered
> task definition (visible to anyone with `ecs:DescribeTaskDefinition`).
> The prod path is `aws.ecs.TaskDefinition.containerDefinitions[].secrets`
> backed by AWS Secrets Manager / SSM Parameter Store. Listed in the
> "future work" section.

---

## 3. Network (VPC) — the chassis (`infra/src/index.ts:53-151`)

### 3.1 VPC

```ts
new aws.ec2.Vpc("clinicsign-vpc-<stack>", {
  cidrBlock: "10.42.0.0/16",
  enableDnsHostnames: true,
  enableDnsSupport: true,
});
```

The `10.42.x.x` range is arbitrary and isolated; nothing else in the AWS
account uses it, which guarantees no peering / route conflicts.

### 3.2 Subnets

Two **public** subnets (`10.42.1.0/24`, `10.42.2.0/24`) — one per AZ,
`mapPublicIpOnLaunch: true`. They host the ALB and NAT Gateway.

Two **private** subnets (`10.42.21.0/24`, `10.42.22.0/24`) — one per AZ,
`mapPublicIpOnLaunch: false`. They host the ECS tasks and the RDS
instance (via a dedicated DB subnet group).

> Two AZs is the minimum for ALB + RDS. We don't currently scale to
> multi-AZ desired count > 1, but the *capacity* to do so is there
> with no infra change.

### 3.3 Routing

- Public route table: `0.0.0.0/0 → IGW`. Both public subnets are
  associated.
- Private route table: `0.0.0.0/0 → NAT Gateway`. Both private subnets
  are associated.

Result: anything in the private subnet can reach the internet (ECR pulls,
Resend, Clerk JWKS) but nothing on the internet can reach into the
private subnet.

### 3.4 NAT Gateway

```ts
const natEip     = new aws.ec2.Eip(...,  { domain: "vpc" });
const natGateway = new aws.ec2.NatGateway(..., {
  allocationId: natEip.id,
  subnetId:     publicSubnet0.id,        // single-AZ NAT for cost
});
```

Single NAT in AZ-0. Production typically deploys one NAT per AZ to
survive an AZ outage; we accept the single point of failure for cost
(NAT is ~$32/mo flat + per-GB egress — doubling it for a demo is
wasteful).

### 3.5 Security groups (the real perimeter)

There are three SGs and they form a chain. Reading order matters:

1. **`albSg`** (`infra/src/index.ts:434-456`) — allows `tcp/80` from
   `0.0.0.0/0`. Even though the public origin is "supposed to be"
   CloudFront, this is open. **This is a known gap**: a determined
   attacker can hit the ALB DNS directly. The ALB still requires a
   valid `Host` and a route; the API otherwise treats the request the
   same. To close this, either:
   - lock ALB ingress to the AWS-managed CloudFront prefix list
     (`com.amazonaws.global.cloudfront.origin-facing`), or
   - put OAC / a custom origin header check in front.
2. **`ecsTaskSg`** (`458-480`) — ingress on `:4000` only from `albSg`,
   egress everywhere. ECS tasks are *not* directly reachable, even
   inside the VPC, except from the ALB.
3. **`rdsSg`** (`159-173`) — *no* baseline ingress. The two ingress
   rules are added separately (`483-503`):
   - `:5432` from `ecsTaskSg`,
   - `:5432` from the optional `rdsAllowedCidr` (laptop break-glass).
   Egress is open, but Postgres doesn't initiate outbound.

So the data path is: **internet → ALB (open) → ECS task (only from
ALB) → RDS (only from ECS task)**. Each hop tightens, and each is
expressed as an SG-to-SG reference, not a CIDR — so subnet renumbering
or instance churn doesn't break the rules.

---

## 4. Database — RDS PostgreSQL (`infra/src/index.ts:153-211`)

```ts
const dbMasterPassword = new random.RandomPassword(...);

const privateDbSubnetGroup = new aws.rds.SubnetGroup(..., {
  subnetIds: [privateSubnet0.id, privateSubnet1.id],
});

const clinicsignDb = new aws.rds.Instance(..., {
  identifier:           "clinicsign-<stack>-pg2",
  engine:               "postgres",
  engineVersion:        "16",
  instanceClass:        "db.t4g.micro",
  allocatedStorage:     20,
  storageType:          "gp3",
  storageEncrypted:     true,           // KMS at rest
  password:             dbMasterPassword.result,
  dbSubnetGroupName:    privateDbSubnetGroup.name,
  vpcSecurityGroupIds:  [rdsSg.id],
  publiclyAccessible:   false,
  skipFinalSnapshot:    true,           // demo; flip for prod
  backupRetentionPeriod: 7,
}, {
  replaceOnChanges: ["dbSubnetGroupName", "publiclyAccessible", "identifier"],
});
```

**Why each line matters:**

- `engine: "postgres"`, `engineVersion: "16"` — pinned. Prisma's
  generated types are tied to a specific PG version; never let RDS
  auto-upgrade silently.
- `storageEncrypted: true` — required for HIPAA-eligible storage.
  Combined with the KMS CMK, every page on disk is encrypted with a
  key you control.
- `publiclyAccessible: false` + private subnet group — the only way to
  reach the DB is from inside the VPC.
- `skipFinalSnapshot: true` — fine for a demo, **dangerous for prod**.
  Set to false and provide `finalSnapshotIdentifier` before going live.
- `replaceOnChanges` — Pulumi will *recreate* the instance (with a
  new identifier) instead of trying to update in place when networking
  shape changes. We hit `InvalidDBSubnetGroupStateFault` in real life
  trying to do an in-place subnet group swap; this annotation says
  "don't bother, just rebuild."

**The connection string** is reconstructed in pure code at the bottom
of the file (`infra/src/index.ts:761-769`):

```ts
export const databaseUrl = pulumi.secret(
  pulumi.all([dbMasterPassword.result, clinicsignDb.address, clinicsignDb.port])
    .apply(([pw, host, port]) => {
      const encoded = encodeURIComponent(pw);
      return `postgresql://clinicsign:${encoded}@${host}:${port}/clinicsign?sslmode=require`;
    })
);
```

`sslmode=require` forces TLS to RDS even though the network path is
private. This is belt-and-braces: an attacker who somehow got into the
VPC still can't sniff cleartext credentials or rows.

`pulumi.secret(...)` marks the output encrypted so `pulumi stack output`
hides it unless you pass `--show-secrets`.

---

## 5. Object storage — S3 + KMS (`infra/src/index.ts:213-316`)

### 5.1 KMS CMK

```ts
const kmsKey = new aws.kms.Key("clinicsign-phi-key", {
  enableKeyRotation:    true,
  deletionWindowInDays: 7,
});
new aws.kms.Alias("clinicsign-phi-key-alias", {
  name:        `alias/clinicsign-${stack}-phi`,
  targetKeyId: kmsKey.keyId,
});
```

A *customer-managed* KMS key (CMK), not the AWS-managed `aws/s3`. Why:

- **Audit visibility**: every encrypt/decrypt shows up in CloudTrail
  with `principalArn` of whoever did it. You can prove who touched a
  PHI byte.
- **Rotation under your control** (`enableKeyRotation: true` schedules
  yearly rotation of the underlying key material; data keys are
  re-encrypted lazily).
- **Revocation**: if a key compromise is suspected, scheduling
  deletion immediately renders all S3 objects encrypted under it
  cryptographically inaccessible — the 7-day window lets you abort.

### 5.2 The bucket

```ts
const documentsBucket = new aws.s3.BucketV2("clinicsign-documents", {
  bucketPrefix: `clinicsign-${stack}-docs-`,
});
```

`bucketPrefix` (not `bucket`) avoids the global-namespace collision risk;
AWS appends randomness.

### 5.3 Hardening (each is a *separate* resource)

| Resource | What it does |
|---|---|
| `BucketPublicAccessBlock` | All four flags `true`. Public ACLs/policies are physically rejected even if a misconfig adds them. |
| `BucketVersioningV2` | Versioning `Enabled`. An accidental `PutObject` to an existing key keeps the prior version recoverable. Important for "clinic uploaded over a signed PDF" worst case. |
| `BucketServerSideEncryptionConfigurationV2` | Default SSE-KMS using our CMK, `bucketKeyEnabled: true` to cut KMS API call cost. |
| `BucketLifecycleConfigurationV2` | Two rules: (a) delete `drafts/*` after 30 days; (b) transition `clinics/*` to `STANDARD_IA` after 90 days. |
| `BucketCorsConfigurationV2` | `GET` only; `*` origin. Browser fetches presigned URLs for PDF rendering — the URL itself is the auth, CORS just lets the browser see the bytes. |

### 5.4 Object key layout

The API picks keys (not the infra). Defined in `apps/api/src/services/`:

```
clinics/<clinicId>/documents/<documentId>/original.pdf
clinics/<clinicId>/documents/<documentId>/signed.pdf
drafts/...                                     (covered by lifecycle)
```

Lifecycle rules and key prefixes are linked: changing one without the
other breaks the cleanup story. Worth grepping if you ever rename keys.

---

## 6. IAM — three identities, three jobs (`infra/src/index.ts:318-398, 547-604`)

### 6.1 ECS execution role (`executionRole`)

```ts
new aws.iam.Role("clinicsign-ecs-exec-<stack>", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "ecs-tasks.amazonaws.com",
  }),
});
new aws.iam.RolePolicyAttachment(..., {
  policyArn: aws.iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy,
});
```

Used by the **ECS agent** to:
- pull the image from ECR,
- write the container's stdout/stderr to CloudWatch Logs.

The application code never assumes this role.

### 6.2 ECS task role (`taskRole`)

This is the role the **application code** runs as. Attached inline
policy grants exactly:

```
s3:ListBucket             on the documents bucket
s3:GetObject/PutObject/
  DeleteObject            on documents bucket/*
kms:Encrypt/Decrypt/
  GenerateDataKey/
  ReEncryptFrom/To        on the CMK
ses:SendEmail/SendRawEmail  *  (SES wired but Resend is the active path)
```

Note what's *not* there: no `s3:PutBucketPolicy`, no `iam:*`, no
`rds:*`, no `kms:CreateKey`. The task can do its job and nothing else.

### 6.3 Legacy IAM user (`appUser`) — to be retired

```ts
const appUser     = new aws.iam.User("clinicsign-app-user", ...);
const appAccessKey = new aws.iam.AccessKey(..., { user: appUser.name });
```

Carries the same S3 + KMS + SES policies as the task role. Exists
because the API today reads `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
out of env (`apps/api/src/services/s3-client.ts:7-26`):

```ts
new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
  ...
});
```

In production this should be deleted: drop those two env vars and let
the SDK pick up the task role automatically (no `credentials` block).
The infra is already provisioning the role; only the app code change
is missing.

---

## 7. Container registry — ECR (`infra/src/index.ts:400-428`)

```ts
const ecrRepo = new aws.ecr.Repository(..., {
  name: `clinicsign-${stack}-api`,
  imageTagMutability: "MUTABLE",
  imageScanningConfiguration: { scanOnPush: true },
});
new aws.ecr.LifecyclePolicy(..., { /* keep last 5 images */ });
```

- `MUTABLE` tags: we re-push `:latest` constantly during dev. For
  prod, switch to `IMMUTABLE` and tag with the git SHA.
- `scanOnPush: true`: ECR runs a native vuln scan on each push. Free,
  no excuse not to enable.
- Lifecycle: keep only the five most recent images. ECR storage
  charges sneak up on you; this caps it.

---

## 8. Compute — ECS Fargate (`infra/src/index.ts:430-676`)

### 8.1 Cluster + log group

```ts
const cluster  = new aws.ecs.Cluster(...);
const logGroup = new aws.cloudwatch.LogGroup(..., {
  name:            `/clinicsign/${stack}/api`,
  retentionInDays: 14,
});
```

14-day retention is enough for ops debugging without piling up costs.
Audit/PHI logging is **not** in CloudWatch — those go to the `AuditLog`
table in Postgres, where they're queryable and properly scoped.

### 8.2 Task definition (`609-651`)

```ts
new aws.ecs.TaskDefinition(..., {
  family:         "clinicsign-<stack>-api",
  cpu:            "512",   // 0.5 vCPU
  memory:         "1024",  // 1 GiB
  networkMode:    "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  executionRoleArn: executionRole.arn,
  taskRoleArn:      taskRole.arn,
  containerDefinitions: pulumi.all([apiImageUri, logGroup.name, apiEnv, apiEnvSecret])
    .apply(([image, lg, env, envSecret]) => JSON.stringify([{
      name: "api",
      image,
      essential: true,
      command: [
        "sh", "-c",
        "cd apps/api && ../../node_modules/.bin/prisma migrate deploy && node dist/server.js",
      ],
      portMappings: [{ containerPort: 4000, protocol: "tcp" }],
      environment: [
        { name: "PORT", value: "4000" },
        ...Object.entries(env       ?? {}).map(([n, v]) => ({ name: n, value: v })),
        ...Object.entries(envSecret ?? {}).map(([n, v]) => ({ name: n, value: v })),
      ],
      logConfiguration: { logDriver: "awslogs", options: { ... } },
    }])),
});
```

Three things worth understanding:

1. **`networkMode: "awsvpc"`** — each task gets its own ENI in the
   private subnet. That's how the ECS task SG can be scoped to a
   single network interface, not a shared host.
2. **`command`** runs `prisma migrate deploy` *before* starting the
   server, every time. This is fine because `migrate deploy` is
   idempotent (only applies *new* migration files), and it means
   schema is always at HEAD without a separate CI step. Trade-off: the
   first task in a deploy carries the migration latency; subsequent
   tasks no-op.
3. **No `healthCheck`** in the container definition. We removed it
   because the container's own health check competes with the ALB's,
   and ECS would kill the task before the ALB had a chance to mark it
   healthy. The single source of truth for "is this task ok" is the
   ALB target group health check (`/health`).

### 8.3 ALB + target group + listener (`505-534`)

```ts
const alb = new aws.lb.LoadBalancer(..., {
  loadBalancerType: "application",
  subnets:          [publicSubnet0.id, publicSubnet1.id],
});

const targetGroup = new aws.lb.TargetGroup(..., {
  port:        4000,
  protocol:    "HTTP",
  targetType:  "ip",                 // required for awsvpc Fargate
  vpcId:       clinicsignVpc.id,
  healthCheck: {
    path: "/health",
    matcher: "200-399",
    interval: 30, timeout: 5,
    healthyThreshold: 2, unhealthyThreshold: 3,
  },
});

const listener = new aws.lb.Listener(..., {
  loadBalancerArn: alb.arn,
  port: 80, protocol: "HTTP",
  defaultActions: [{ type: "forward", targetGroupArn: targetGroup.arn }],
});
```

- `targetType: "ip"` — required when ECS uses `awsvpc` mode (each
  task is an IP, not an instance).
- `/health` returns `{ status: "ok" }` (`apps/api/src/app.ts:51-53`).
  The endpoint hits no DB or S3 on purpose: a healthy task is
  one that can serve HTTP, regardless of dependency state. Dependency
  health is observed elsewhere (logs, RDS metrics) so we don't take
  the API offline because of a transient downstream blip.
- HTTP `:80` only — TLS terminates at CloudFront. The ALB is reachable
  on plaintext HTTP, which is acceptable because the SG is supposed to
  restrict it to CloudFront. See the "known gap" call-out in §3.5.

### 8.4 Service (`653-676`)

```ts
new aws.ecs.Service(..., {
  desiredCount:   1,
  launchType:     "FARGATE",
  taskDefinition: taskDefinition.arn,
  networkConfiguration: {
    assignPublicIp: false,         // private subnets, no public IP
    subnets:        [privateSubnet0.id, privateSubnet1.id],
    securityGroups: [ecsTaskSg.id],
  },
  loadBalancers: [{ targetGroupArn, containerName: "api", containerPort: 4000 }],
}, { dependsOn: [listener], ignoreChanges: ["desiredCount"] });
```

`ignoreChanges: ["desiredCount"]` so that manual scaling via
`aws ecs update-service` (or autoscaling, eventually) doesn't get
reverted on the next `pulumi up`.

---

## 9. Edge — CloudFront (`infra/src/index.ts:678-728`)

```ts
const cachePolicy         = aws.cloudfront.getCachePolicyOutput({ name: "Managed-CachingDisabled" });
const originRequestPolicy = aws.cloudfront.getOriginRequestPolicyOutput({ name: "Managed-AllViewer" });

new aws.cloudfront.Distribution(..., {
  origins: [{
    originId:   "alb-origin",
    domainName: alb.dnsName,
    customOriginConfig: { httpPort: 80, originProtocolPolicy: "http-only" },
  }],
  defaultCacheBehavior: {
    targetOriginId:        "alb-origin",
    viewerProtocolPolicy:  "redirect-to-https",
    allowedMethods:        ["GET","HEAD","OPTIONS","PUT","PATCH","POST","DELETE"],
    compress:              true,
    cachePolicyId:         cachePolicy.id,
    originRequestPolicyId: originRequestPolicy.id,
  },
  viewerCertificate: { cloudfrontDefaultCertificate: true },
});
```

Why CloudFront for an API:
- **Free TLS** with the default `*.cloudfront.net` cert. No ACM, no
  Route 53, no domain. Vercel + Clerk just need an HTTPS URL.
- `Managed-CachingDisabled` + `Managed-AllViewer`: CloudFront passes
  every header, query param and cookie through; no caching. We're
  using CloudFront purely as a TLS shim, not a cache.
- `viewerProtocolPolicy: "redirect-to-https"` — clients that hit
  `http://` get a 301 to `https://`.
- `priceClass: "PriceClass_100"` — North America + Europe edges only
  (cheapest). For global users, change to `_All`.

`originProtocolPolicy: "http-only"` is fine because traffic
CloudFront → ALB stays on AWS's network, but for a regulated workload
you'd put a self-signed cert on the ALB and switch to `https-only` so
no plaintext crosses any wire, even AWS-internal.

---

## 10. Outputs (`infra/src/index.ts:746-774`)

After `pulumi up` you can `pulumi stack output [name] [--show-secrets]`
to fetch:

| Output | Meaning |
|---|---|
| `s3BucketName`, `s3BucketArn` | the documents bucket |
| `kmsKeyArn`, `kmsKeyAlias` | the PHI CMK |
| `iamUserName`, `iamAccessKeyId`, `iamSecretAccessKey` (secret) | legacy app user creds |
| `awsRegion`, `ecrRepositoryUrl` | for `docker push` |
| `rdsHost`, `rdsPort`, `databaseUrl` (secret) | DB conn string |
| `vpcId` | for any future cross-stack VPC consumers |
| `albDnsName` | the raw `*.elb.amazonaws.com` (debugging only) |
| `cloudFrontDomainName`, `apiBaseUrl` | this is the URL Vercel/Clerk point at |

---

## 11. The end-to-end deploy lifecycle

A "release" today is three commands, each one understood:

```bash
# 1) Build the API image for x86 (Fargate is amd64; mac default is arm64)
docker buildx build --platform linux/amd64 \
  -t "$ECR_URL:latest" \
  -f apps/api/Dockerfile . --push

# 2) Migrate + roll the API tasks
aws ecs update-service \
  --cluster clinicsign-dev \
  --service clinicsign-dev-api \
  --force-new-deployment

# 3) Frontend ships independently via Vercel git push
git push origin master
```

What happens when ECS picks up the new image:
1. ECS pulls the new image from ECR (uses execution role).
2. Container starts → `prisma migrate deploy` runs → `node dist/server.js`.
3. ALB target group health check polls `/health` until two 200s in a
   row → marks new target healthy → drains old.
4. Old task gets `SIGTERM` → `server.ts:28-30` catches it → closes the
   HTTP server cleanly, then `prisma.$disconnect()`, then `exit(0)`.

The only failure modes I've actually hit in this repo:
- **Wrong image arch** (`docker build` on M-series Mac without
  `--platform linux/amd64`) → ECS task fails to pull, prints
  `manifest does not contain descriptor matching platform 'linux/amd64'`.
- **Missing env var** → container starts, `env.ts` Zod parse fails,
  process exits 1, ECS keeps restarting it. CloudWatch shows
  `Invalid environment configuration`.
- **`DATABASE_URL` got dropped** during a `pulumi config` sanitize →
  same as above, just the DB-shaped instance of it.
- **Health check too aggressive** (container `HEALTHCHECK` competing
  with ALB) → tasks flap. We removed the container-level healthcheck;
  see §8.2.

---

## 12. Trust boundary cheat sheet

| Boundary | Crosses what | Auth | Confidentiality |
|---|---|---|---|
| Browser → Vercel | public internet | none (public site) / Clerk session cookie (logged-in) | TLS (Vercel cert) |
| Browser → CloudFront → ALB → ECS | public internet | for `/api/*`: Clerk JWT (provider) **or** raw signing token (patient); for `/api/webhooks/clerk`: Svix HMAC | TLS to CF; HTTP CF→ALB (AWS network) |
| ECS → RDS | private VPC | Postgres user+pw via `DATABASE_URL` | TLS (`sslmode=require`) |
| ECS → S3 / KMS | AWS network | IAM (legacy access key today, task role tomorrow) | TLS (S3 endpoint) |
| ECS → Resend / Clerk JWKS | NAT egress → public internet | API key / public JWKS | TLS |
| Patient browser → S3 (presigned URL) | public internet | URL-bound HMAC, 5 min TTL (signing view) or 7 day TTL (post-sign download in email) | TLS |

If a single piece of paper had to summarise the security posture, it's
this table.

---

## 13. What I'd change for prod (non-exhaustive)

Listed in priority order. Each is a small PR.

1. **Drop the IAM user, use the task role.** Remove
   `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from `env.ts` and the
   `S3Client` constructor; the SDK picks up the task role from the ECS
   metadata endpoint automatically. Then delete `appUser`/`appAccessKey`
   from `infra/src/index.ts`.
2. **Restrict ALB ingress.** Replace the `0.0.0.0/0` SG rule with the
   AWS-managed `com.amazonaws.global.cloudfront.origin-facing` prefix
   list, or attach an OAC that signs the request and have the API
   reject anything missing the signature header.
3. **HTTPS to the ALB** (`http-only` → `https-only`), with a
   self-signed cert if you don't want to buy a domain.
4. **Multi-AZ NAT and ECS desiredCount ≥ 2.** Costs ~2× NAT and ~2× task
   compute. Buys true AZ failure tolerance.
5. **Secrets via Secrets Manager.** Switch `containerDefinitions[].environment`
   entries that contain real secrets to `containerDefinitions[].secrets`,
   pointing at `arn:aws:secretsmanager:...`. Removes plaintext from the
   task definition.
6. **RDS hardening.** `deletionProtection: true`, `skipFinalSnapshot:
   false`, `backupRetentionPeriod: 30`, `performanceInsightsEnabled:
   true`.
7. **VPC endpoints** for S3, ECR, CloudWatch Logs, Secrets Manager.
   Cuts NAT egress (and thus cost) and removes the public-internet hop
   for service traffic.
8. **WAF** (managed rule set) in front of CloudFront.
9. **CloudTrail** to a separate, write-only S3 bucket — required for
   any HIPAA story.

None of these change the application code; they're all in
`infra/src/index.ts`.

---

## 14. Recreating it from scratch

```bash
# Pre-req: aws cli configured, pulumi cli installed, docker running
cd infra
pulumi login                          # cloud backend
pulumi stack init dev
pulumi config set aws:region us-east-1
pulumi config set --secret apiEnvSecret.CLERK_SECRET_KEY  sk_...
pulumi config set --secret apiEnvSecret.CLERK_WEBHOOK_SECRET whsec_...
pulumi config set --secret apiEnvSecret.RESEND_API_KEY    re_...
pulumi config set --secret apiEnvSecret.JWT_SIGNING_SECRET <32+ char>
pulumi config set       apiEnv.NODE_ENV     production
pulumi config set       apiEnv.LOG_LEVEL    info
pulumi config set       apiEnv.WEB_APP_URL  https://your-vercel.app
pulumi config set       apiEnv.EMAIL_FROM   onboarding@resend.dev
pulumi up
# (DATABASE_URL is computed by pulumi after RDS exists; copy it out)
pulumi config set --secret apiEnvSecret.DATABASE_URL "$(pulumi stack output databaseUrl --show-secrets)"
pulumi config set       apiEnv.AWS_REGION         us-east-1
pulumi config set --secret apiEnvSecret.AWS_ACCESS_KEY_ID     "$(pulumi stack output iamAccessKeyId)"
pulumi config set --secret apiEnvSecret.AWS_SECRET_ACCESS_KEY "$(pulumi stack output iamSecretAccessKey --show-secrets)"
pulumi config set       apiEnv.S3_BUCKET_NAME     "$(pulumi stack output s3BucketName)"
pulumi up                                      # re-renders task def with new env
# Push initial image:
ECR_URL=$(pulumi stack output ecrRepositoryUrl)
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "$ECR_URL"
docker buildx build --platform linux/amd64 -t "$ECR_URL:latest" -f ../apps/api/Dockerfile .. --push
aws ecs update-service --cluster clinicsign-dev --service clinicsign-dev-api --force-new-deployment
```

Then in Vercel:
- `NEXT_PUBLIC_API_URL = https://<cloudFrontDomainName>`
- `CLERK_*` keys (publishable + secret, *not* webhook — that goes to AWS).

In Clerk:
- Webhook endpoint: `https://<cloudFrontDomainName>/api/webhooks/clerk`
- Subscribe to `user.created`, `user.updated`, `user.deleted`.

Tear down:

```bash
cd infra && pulumi destroy
```

---

## 15. Cost shape (rough, dev stack)

| Line item | ~$/mo at idle |
|---|---|
| NAT Gateway (always-on) | $32 |
| RDS db.t4g.micro single-AZ | $15 |
| ALB | $16 + per-request |
| ECS Fargate (1 task, 0.5 vCPU / 1 GiB, 24/7) | $13 |
| CloudFront | < $1 |
| S3 + KMS | < $1 |
| ECR | < $1 |
| CloudWatch Logs (14d) | < $1 |
| **Total** | **~$80** |

NAT is the biggest single line item. VPC endpoints for S3/ECR/Logs
cut it materially in production; for a demo we just `pulumi destroy`
when the lights go out.
