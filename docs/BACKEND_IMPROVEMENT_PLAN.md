# ClinicSign — backend improvement plan & study guide

Written for my own study. Treats this repo as a training ground for going from mid-level to senior backend engineer. Each section is actionable on *this codebase*, paired with the theory you'd be expected to know at a Stripe/Uber/Anthropic-level interview.

---

## Table of contents

1. [Honest critique of the current backend](#1-honest-critique-of-the-current-backend)
2. [Improvement roadmap (ordered by impact × learning)](#2-improvement-roadmap-ordered-by-impact--learning)
3. [Observability: deep dive](#3-observability-deep-dive)
4. [Retrospective — problems I hit building this and how I tackled them](#4-retrospective--problems-i-hit-building-this-and-how-i-tackled-them)
5. [Study plan: books, papers, courses, source code](#5-study-plan-books-papers-courses-source-code)
6. [Weekly schedule](#6-weekly-schedule)

---

## 1. Honest critique of the current backend

### What's genuinely good

- **Type safety end-to-end.** Strict TS, no `any`, Zod at every boundary (body, params, query, env). Prisma-generated types feed the service layer. The compiler catches a real class of bugs before runtime.
- **Env validation at boot.** `config/env.ts` parses every env var with Zod; if anything's missing or malformed, the process refuses to start with a structured error. No half-booted services — a common production failure mode.
- **Idempotent migrations at deploy time.** `prisma migrate deploy` runs in the container entrypoint; rolling deploys are safe because `migrate deploy` only applies *new* migration files.
- **Audit log as a first-class model.** `AuditLog` is append-only by convention (no `.update`/`.delete` call sites), indexed by `(documentId, timestamp)`, with `metadata Json` for payload flexibility. This is the right shape for compliance-adjacent systems.
- **Least-privilege IAM task role** (provisioned but not wired yet — see weakness below).
- **Structured logging with request correlation.** Pino + `pino-http` + `x-request-id` propagated through every log line. You can grep a single request ID across CloudWatch and see the whole lifecycle.
- **Health check that doesn't cascade failures.** `GET /health` touches no downstream — a healthy task is one that can serve HTTP, regardless of RDS/S3 state. Prevents flapping during dependency blips.
- **Thin routes, fat services.** No Prisma calls in `routes/*.ts`; business logic lives in `services/*.ts`. Makes it possible to port the API to a different HTTP framework or test services in isolation.

### What's weak (in rough order of cost-to-fix vs. risk)

| Weakness | Impact | Effort |
|---|---|---|
| No async job queue — PDF render + email is synchronous in the HTTP request | p99 latency spikes under load; email failures kill the sign request | High |
| Rate limiter is in-process (`express-rate-limit` default memory store) | Breaks the moment we scale past 1 ECS task | Low |
| No metrics or traces, only logs | Can't answer "why is sign latency p99 spiking?" without grepping | Medium |
| No load test → no SLO → no error budget | We don't know where this breaks | Low to start, high to tune |
| Secrets rendered inline in the ECS task definition | Visible to anyone with `ecs:DescribeTaskDefinition` | Low |
| Legacy IAM user + access keys in env vars (instead of ECS task role) | Key rotation friction; one leaked env dump == lateral movement | Low |
| No DB connection pooling config; each task uses Prisma's default | Works at 1 task, degrades at N tasks against `db.t4g.micro` | Low–Medium |
| No idempotency on `/send`, `/resend`, `/complete` | Double-click → two emails; retry → two signatures | Medium |
| No explicit timeouts on outbound S3 / Resend / Clerk calls | A slow upstream wedges request handlers | Low |
| No integration tests against a real Postgres | Regressions slip through on schema changes | Medium |
| ALB ingress is `0.0.0.0/0:80`, not restricted to CloudFront | Determined attacker can bypass CloudFront | Low |
| Response payloads include internal fields (`clinicId`, `originalPdfKey`) | Information disclosure; enlarges attack surface on token leak | Low |
| No DLP / PII redaction in logs | Accidentally logging `email` or `name` writes PHI to CloudWatch | Medium |
| No structured error taxonomy for retryable vs terminal | Client retries things it shouldn't; gives up on things it shouldn't | Medium |
| `AuditLog` append-only by *convention* only, not enforced in the DB | A rogue Prisma call could delete rows | Medium |
| No API versioning (`/v1`) | Future breaking changes are painful | Low |

This list is the backlog.

---

## 2. Improvement roadmap (ordered by impact × learning)

Each item: **what**, **why**, **how (concrete changes)**, **interview angle** (what a senior screener asks about this topic).

### 2.1 Observability (do first — blocks everything else)

See §3 for the deep dive. Without metrics and traces you're flying blind — any performance work after this is measurable; any incident is explicable.

---

### 2.2 Async job queue for the signing pipeline

**What**: today `POST /api/sign/:token/complete` validates the token, renders the PDF, writes to S3, writes DB, sends the completion email, and only then returns. All synchronous.

**Why it's a problem**:
- If Resend is slow, the patient's browser waits on email delivery before seeing "signed"
- `pdf-lib` is CPU-bound; concurrent signs on a shared Fargate task compete for CPU
- If email fails, we can't tell the patient "you're signed, we're retrying the email" — we have to 500
- No retry story; no way to replay a failed render

**How (concrete for this repo)**:

```
Patient POST /complete
  ├─ verify token
  ├─ persist field values
  ├─ enqueue CompleteSigningJob { documentId, recipientId }
  ├─ AuditLog: DOCUMENT_SIGN_QUEUED
  └─ return { status: "processing", pollUrl: "/sign/:token/status" }

Worker (separate ECS service or long-running Node process)
  ├─ dequeue
  ├─ render PDF via pdf-lib
  ├─ put to S3
  ├─ update Document.status = SIGNED, signedAt, signedPdfKey
  ├─ AuditLog: DOCUMENT_SIGNED
  ├─ send completion email
  └─ ack / nack
```

Queue options:
- **BullMQ** (Node + Redis): simplest for a single-cloud setup. Needs an ElastiCache Redis, which is ~$15/mo. Great DX.
- **SQS**: AWS-native, no new infra. Great for durability and DLQ. SDK is verbose.
- **EventBridge + Step Functions**: overkill for this, but relevant for "orchestrate multi-step workflows". Worth knowing for interviews.

For this repo, I'd pick **SQS**: infra's already AWS, adds no new service, DLQ built-in, IAM-scoped naturally.

**Idempotency**: every enqueued job has an idempotency key = `${documentId}:${recipientId}`. Worker checks `DocumentRecipient.signedAt` before doing work — if set, ack and move on. Retries are safe.

**Interview angle**:
- "How does your app behave when email provider is down?" → "Here's my queue + DLQ + retry policy"
- "Explain exactly-once vs at-least-once delivery" → at-least-once + idempotent consumer is the standard pattern
- "How do you detect poison messages?" → DLQ threshold, alarm on queue depth, automated replay tool
- "What's a saga pattern?" → if the worker writes to S3 *and* updates the DB, you need compensating actions if one fails after the other succeeds

**Study for this**: Kleppmann ch. 11 (Stream Processing); AWS SQS docs; Gregor Hohpe's "Enterprise Integration Patterns" (browse, don't read cover-to-cover).

---

### 2.3 Idempotency keys on write endpoints

**What**: client sends `Idempotency-Key: <uuid>` header. Server stores `(key, request-hash, response)` for N hours. Subsequent requests with the same key return the cached response.

**Why**: Stripe's pattern. Makes retries safe — network hiccups don't double-charge (in our case, double-send the email or create duplicate audit rows).

**How (this repo)**:
- New table `IdempotencyKey { id, key, userId, requestHash, response Json, createdAt, expiresAt }`
- Middleware that runs on `POST /documents`, `POST /documents/:id/send`, `POST /documents/:id/resend`, `POST /sign/:token/complete`
- Lookup → if hit & not expired → return cached response
- Miss → run handler, store result
- TTL of 24h (Stripe uses 24h; match it)

**Interview angle**: "Design Stripe's idempotency." They want you to talk about: hash validation (detect key reuse with different bodies), concurrent request handling (advisory locks, or DB constraint), and TTL.

**Study**: [Stripe's idempotency blog post](https://stripe.com/blog/idempotency). Short, canonical.

---

### 2.4 Replace in-memory rate limiter with Redis-backed

**What**: `express-rate-limit` defaults to a memory store per process. The moment you scale past 1 ECS task, each task has its own counter, so the limit is effectively N×.

**How**: add `rate-limit-redis` (or `@upstash/ratelimit`), point at ElastiCache. Same middleware interface.

```ts
import { createClient } from "redis";
import { RedisStore } from "rate-limit-redis";

const store = new RedisStore({
  sendCommand: (...args) => redis.sendCommand(args),
  prefix: "rl:",
});

const limiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  store,
});
```

**Interview angle**: "Design a rate limiter." Classic question. Know the four algorithms:
- Fixed window (simplest, bursty at boundaries)
- Sliding window log (accurate, memory-heavy)
- Sliding window counter (approximation of the above)
- Token bucket / leaky bucket (smoothed)

**Study**: Alex Xu "System Design Interview" vol. 1, chapter 4. Short chapter, high signal.

---

### 2.5 Connection pooling for Prisma → RDS

**What**: Prisma's default connection pool is per-process (default 10 for Postgres). At N ECS tasks × 10 conns × M instances during a deploy, RDS `db.t4g.micro` (default `max_connections=85`) runs out.

**How**:
- **Short-term**: tune `connection_limit` query param in `DATABASE_URL` down (e.g. 5 per task), watch for pool exhaustion under load test
- **Better**: deploy **pgBouncer** as a sidecar or a separate task, in transaction-pooling mode
- **Alternative**: Prisma Accelerate (managed global pooler) — costs money, trades infra complexity for recurring fee

Tradeoffs:
- pgBouncer in transaction mode disables `SET`, prepared statements across queries, and some advisory locks — Prisma handles this OK but knowing the limitation is senior-level

**Interview angle**: "You've got 100 API tasks, each with 10 DB connections, and a single Postgres primary with 200 max_connections. What breaks and how do you fix it?" Answer: pgBouncer + RDS Proxy + read replica split.

**Study**: [AWS RDS Proxy docs](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html), [pgBouncer README](https://www.pgbouncer.org/).

---

### 2.6 Load testing + SLOs

**What**: you cannot improve what you don't measure. Before touching code, establish a baseline.

**How (concrete for this repo)**:

```js
// scripts/load/list-docs.js — k6 script
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m",  target: 50 },
    { duration: "2m",  target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed:   ["rate<0.01"],
  },
};

export default function () {
  const res = http.get(`${__ENV.API}/api/documents?limit=20`, {
    headers: { Authorization: `Bearer ${__ENV.TOKEN}` },
  });
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(1);
}
```

Scenarios to test:
- `GET /documents` under steady load (read path)
- `POST /documents/:id/send` bursts (write path, hits Resend)
- Mixed pattern (80/20 read/write) to simulate real use
- Ramp to breaking point to find p99 cliff

Define **SLOs** based on observed p99:
- `GET /documents`: p99 < 500ms, availability 99.5%
- `POST /sign/:token/complete`: p99 < 5s (because of PDF render), availability 99.9%
- Error budget: the 0.5% / 0.1% complement — budget for controlled risk

**Interview angle**: SRE book's chapter on SLIs/SLOs/SLAs. Know the difference, know how to set them, know what an "error budget policy" is.

**Study**: [Google SRE book ch. 3–4](https://sre.google/sre-book/service-level-objectives/), free online. This is the canonical text.

---

### 2.7 Response DTO layer (hide internals)

See my explanation in [Q1 of the chat](#hidden) — currently responses leak `clinicId`, `createdByUserId`, `originalPdfKey`. Need explicit response shapes.

**Where**: `apps/api/src/schemas/` for Zod output schemas + per-resource mappers in services.

**Interview angle**: "How do you prevent accidental data leakage in your API?" Answer: explicit DTOs, Zod-validated on the way out, linted denylist of fields-that-must-never-leave-the-backend.

---

### 2.8 Security hardening (low effort, concrete PRs)

Each one is small, each one is a 10-line commit, each one demonstrably improves posture. Listed in `infra/ARCHITECTURE.md` §11. Summary:

1. Drop the IAM user; use the task role (change in `apps/api/src/services/s3-client.ts`)
2. Switch ECS secrets from inline env to `containerDefinitions[].secrets` → Secrets Manager
3. Lock ALB SG to the `com.amazonaws.global.cloudfront.origin-facing` prefix list
4. Put a self-signed cert on the ALB; set CloudFront origin to `https-only`
5. Add AWS WAF managed rule set in front of CloudFront (bot control, SQLi/XSS, rate)
6. Enable CloudTrail data events on the KMS key and S3 bucket to a separate write-only bucket
7. Add VPC endpoints for S3 + ECR + CloudWatch Logs (cuts NAT bill and removes public-internet hop)

**Interview angle**: "Describe the defense-in-depth in your API's deployment." Walk through perimeter → ALB → task → RDS, what enforces each boundary, what would happen if any one is broken.

---

### 2.9 Audit log tamper-evidence (nice-to-have, impressive)

**What**: each `AuditLog` row contains `prevHash` = SHA-256 of the prior row's (id + prevHash + eventType + metadata + timestamp). A tamper breaks the chain.

**Why**: takes the audit log from "trust me, we don't delete" to "here's cryptographic evidence nothing was touched".

**How**:
- New column `prevHash String?` on `AuditLog`
- A serialization service computes hashes at write time
- Nightly verifier job walks the chain and alerts on break
- Expose `/api/documents/:id/audit-integrity` returning `{ ok: true, checkedAt }` or `{ ok: false, brokeAtRowId }`

**Interview angle**: This is how Certificate Transparency logs, blockchain, and HIPAA-serious audit systems work. Bring it up as an example of applying cryptographic primitives to app-level integrity.

**Study**: Merkle trees. [Certificate Transparency RFC 6962](https://datatracker.ietf.org/doc/html/rfc6962). You don't need to implement a Merkle tree; you need to understand why chain-of-hashes ≠ replay protection (that's HMAC) ≠ non-repudiation (that's a signed statement).

---

### 2.10 Testing maturity

The pyramid, with numbers I'd aim for on this repo:

```
        ▲ 5–10 e2e tests        (Playwright against deployed app)
       ▲▲▲ 30–50 integration    (testcontainers: real Postgres + S3 via MinIO)
      ▲▲▲▲ 200+ unit            (services, utils, token hashing)
```

Currently: ~0 of any. Start middle out.

**Integration test setup for this repo**:

```ts
// tests/setup.integration.ts
import { GenericContainer } from "testcontainers";
import { execSync } from "node:child_process";

export async function setupDb() {
  const pg = await new GenericContainer("postgres:16")
    .withEnvironment({ POSTGRES_PASSWORD: "x", POSTGRES_DB: "test" })
    .withExposedPorts(5432)
    .start();

  process.env.DATABASE_URL = `postgresql://postgres:x@localhost:${pg.getMappedPort(5432)}/test`;
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  return { stop: () => pg.stop() };
}
```

Then write real end-to-end flows hitting Prisma + in-memory S3 (`@aws-sdk/client-s3` + LocalStack).

**Interview angle**: "Tell me about your testing strategy." Have an opinion. The pyramid. Why integration > mocks for anything with a schema. Why e2e for happy paths only.

**Study**: Kent Beck's old TDD book for the religion, Martin Fowler's [testing taxonomy posts](https://martinfowler.com/bliki/TestPyramid.html) for the terminology everyone uses.

---

## 3. Observability deep dive

Three signals, one practice.

### 3.1 The three signals

| Signal | Answers | Tools |
|---|---|---|
| **Logs** | *What happened?* Structured events at specific points. | Pino → CloudWatch (today). Add per-event log budgets so `DEBUG` doesn't nuke the bill. |
| **Metrics** | *How much? How often?* Aggregated numbers over time. | Add OpenTelemetry + Prometheus-style metrics; export to Honeycomb / Grafana Cloud / CloudWatch EMF. |
| **Traces** | *Where did the time go?* One request becomes a tree of spans. | OpenTelemetry SDK. Export via OTLP. Honeycomb has a free tier sufficient for demo-scale. |

**Today this repo has**: logs, well.
**Today this repo is missing**: metrics, traces.

### 3.2 What to measure (RED for request handlers, USE for resources)

**RED** — apply to every route:
- **Rate**: requests/sec
- **Errors**: failures/sec (break down by status code + error code)
- **Duration**: p50/p95/p99 latency

**USE** — apply to every resource:
- **Utilization**: % time busy (CPU, DB pool, queue workers)
- **Saturation**: queue depth, pending connections
- **Errors**: hardware/resource-level errors (OOM, disk full, conn refused)

Concrete metrics I'd add to this API, with Prometheus-ish names:

```
clinicsign_http_requests_total{route, method, status}       counter
clinicsign_http_request_duration_seconds{route, method}     histogram
clinicsign_http_requests_in_flight{route}                    gauge

clinicsign_s3_operation_duration_seconds{op=get|put}         histogram
clinicsign_s3_operation_errors_total{op, reason}             counter

clinicsign_pdf_render_duration_seconds{field_count_bucket}   histogram
clinicsign_pdf_render_errors_total{reason}                   counter

clinicsign_db_query_duration_seconds{query_name}             histogram
clinicsign_db_pool_connections{state=idle|busy|waiting}      gauge

clinicsign_email_send_duration_seconds{kind=invite|completion|reminder}  histogram
clinicsign_email_send_errors_total{kind, reason}             counter

clinicsign_signing_token_verify_total{result=ok|expired|revoked|signed}  counter
```

### 3.3 Distributed tracing

Every request gets a trace. Every significant span gets attributes. Example trace for a patient signing:

```
POST /api/sign/:token/complete                         [span 1] 2.8s
├─ token.verify                                        [span 2] 12ms
├─ signing.validateFields                              [span 3] 3ms
├─ s3.getObject (original.pdf)                         [span 4] 180ms
├─ pdf-field-renderer.renderValues                     [span 5] 1.9s ← hot spot
│  └─ pdf-lib.PDFDocument.load                         [span 6] 320ms
│  └─ pdf-lib.embedFonts                               [span 7] 210ms
│  └─ overlayFields (loop × 8)                         [span 8] 1.3s
├─ s3.putObject (signed.pdf)                           [span 9] 210ms
├─ prisma.document.update                              [span 10] 15ms
├─ prisma.auditLog.create                              [span 11] 8ms
└─ email.sendCompletion                                [span 12] 470ms
```

Without traces, you'd see "/complete: 2.8s" in logs and have no idea where the time went.

**Setup in ~50 lines** for this repo:

```ts
// apps/api/src/otel.ts (imported before anything else in server.ts)
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PrismaInstrumentation } from "@prisma/instrumentation";

new NodeSDK({
  serviceName: "clinicsign-api",
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
    new PrismaInstrumentation(),
  ],
}).start();
```

Auto-instrumentations give you HTTP, Express, AWS SDK, DNS spans for free. Prisma has a dedicated one that spans every query.

### 3.4 SLOs (service level objectives)

**SLI**: thing you measure (e.g. "request succeeded with latency < 500ms")
**SLO**: target for the SLI over a window (e.g. "99% of requests meet the SLI over 28 days")
**SLA**: contractual SLO + penalty (external)

Example SLOs for ClinicSign at demo-scale:

| Service | SLI | SLO |
|---|---|---|
| `/api/documents` (list) | 2xx with p95 < 500ms | 99.0% / 28d |
| `/api/documents/:id/send` | 2xx | 99.5% / 28d |
| `/api/sign/:token` (patient view) | 2xx with p95 < 1s | 99.5% / 28d |
| `/api/sign/:token/complete` | 2xx with p95 < 5s | 99.0% / 28d |
| Audit log write (internal) | success | 99.99% / 28d |

**Error budget** = 100% − SLO. If /documents burns 1% error budget in a week, you don't ship new features that week — you fix reliability first. This is the SRE disciplined version of "move fast and break things".

### 3.5 Dashboards (what to actually show)

Anti-pattern: a dashboard with 40 panels nobody reads. Aim for **two dashboards**:

**Service dashboard** (one per service):
1. Request rate (stacked by route)
2. Error rate (stacked by error code)
3. p50 / p95 / p99 latency
4. In-flight requests
5. Upstream dependencies: S3 latency, DB pool utilization, Resend latency
6. Recent deploys as annotations (vertical lines)

**SLO dashboard**:
1. Remaining error budget per SLO
2. Burn rate (how fast we're spending budget)
3. Time to budget exhaustion at current burn rate

That's it. If you need more, add it reactively during an incident, not proactively.

### 3.6 Alerts: symptom, not cause

- **Good alert**: "p99 `/complete` > 10s for 5m" (symptom — user pain)
- **Bad alert**: "pdf-lib.renderPage took > 1s" (cause — might be fine)

Why: cause-based alerts create alert fatigue. Symptom-based alerts page you when something users notice is broken. The cause is for *you* to figure out once you're paged.

Two-level alert policy:
- **Fast burn** (2% budget in 1h): page immediately
- **Slow burn** (5% budget in 6h): ticket, deal in business hours

### 3.7 On-call and post-mortems

Even solo. When something breaks in your deployed app:

1. **Mitigate first**, diagnose second. Revert the deploy, scale up, fail over — stop the bleeding.
2. Write a **blameless post-mortem** even for a hobby app. Structure:
   - Summary (1 sentence)
   - Impact (what users saw)
   - Timeline (UTC timestamps)
   - Root cause
   - What went well
   - What went poorly
   - Action items (with owners + dates)
3. Action items go on the backlog and actually get done. The post-mortem is worthless otherwise.

**Study**: [Google SRE book chapters 15–16](https://sre.google/sre-book/postmortem-culture/). Rob Ewaschuk's ["My Philosophy on Alerting"](https://docs.google.com/document/d/199PqyG3UsyXlwieHaqbGiWVa8eMWi8zzAn0YfcApr8Q/edit) memo — short, required reading.

---

## 4. Retrospective — problems I hit building this and how I tackled them

Reading this back later for interviews. Each one is a "tell me about a time" story.

### 4.1 PDF field coordinates drifting on mobile

**Symptom**: signature overlays appeared in the right place on desktop (1024px+) but shifted by 10–40% on mobile (375px).

**Investigation**:
- Added a `PdfDebugInspector` overlay that printed, for each rendered page: wrapper width, canvas width, expected vs painted overlay positions, per-axis drift in px
- Read-out revealed the wrapper was 320px but the canvas was rendering at 320px *and* `Page` was receiving `width={320}`, yet overlay absolute positions were computed against 360px — confirming a wrapper / canvas / state-mismatch

**Root cause**: `useLayoutEffect` with `[pageHostRef.current]` was firing before `<Page>` had mounted its internal DOM. The first pass measured a stale width; `ResizeObserver` never attached because the host was still `null` when the effect ran.

**Fix**: migrated from `useRef` to a **callback ref** (React 19 supports returning a cleanup from it). The callback fires on attach *and* detach, deterministically, after the DOM is committed. Got the first correct measurement on the very first paint.

**Lesson**:
- `useRef` + `useEffect` is not a safe measurement pattern for elements whose mount time isn't deterministic (e.g. gated behind a `useQuery`)
- Callback refs are the correct primitive for "run code when this DOM node attaches"
- When a layout bug doesn't make sense, log numbers, not descriptions. The `PdfDebugInspector` paid for itself 10x over.

### 4.2 pdf.js crashing during SSR

**Symptom**: `/sign/:token` returned 500 on the server render.

**Root cause**: `pdfjs-dist` has top-level browser-only code (`window`, `document`, `Worker`). Importing it from a file included in SSR blew up.

**Fix**: deferred worker configuration into a client-only `useEffect`, moved `react-pdf` imports behind a dynamic import with `ssr: false`. Added a comment in `lib/pdf-worker.ts` documenting *why* the worker config lives there and not at module scope.

**Lesson**: check for `typeof window` guards or dynamic-import patterns for any lib that talks to the DOM or Web Workers. The Next.js error is generic ("window is not defined"); the cause is usually a transitive import.

### 4.3 ECS tasks crashloop on first deploy

**Three separate instances**:

1. **Arch mismatch**: Docker on M-series Mac defaults to arm64; Fargate runs amd64. Manifest error on pull. Fix: `docker buildx build --platform linux/amd64`.
2. **Missing env var**: `env.ts` Zod parse failed at boot, process exits 1, ECS restarts, repeat. No user-facing symptom except "task stopped". Fix: read CloudWatch Logs, match against the Zod error format, add the missing key via `pulumi config set --secret`.
3. **Health check too aggressive**: a container-level `HEALTHCHECK` in the Dockerfile was competing with the ALB target group health check. ECS would kill the task before the ALB marked it healthy. Fix: removed the container-level check. Single source of truth for health = ALB.

**Lesson**: the first deploy of any new infra almost never works on try 1. Build muscle for "read logs → fix one specific thing → redeploy" instead of "stare at the diagram".

### 4.4 RDS not reachable from my laptop

**Context**: deliberately configured `publiclyAccessible: false` + private subnets. Migrations still need to run.

**Options I considered**:
1. SSM Session Manager into a bastion (proper) → too much setup for demo
2. Temporarily add my IP to the RDS SG (break-glass) → picked this
3. Run migrations inside the ECS task on boot (also picked — complements option 2)

**What I did**: declared an optional `rdsAllowedCidr` Pulumi config key that, when set, punches a `:5432` hole in the RDS SG for a single CIDR. Set it during local dev, unset before any "real" deploy. Plus `prisma migrate deploy` runs in the container entrypoint, so prod migrations don't need a laptop at all.

**Lesson**: *how to reach a private resource* is always part of the design, not an afterthought. Knowing you have bastion, SSM Session Manager, Client VPN, and direct-peering as options makes you sound senior.

### 4.5 Clerk webhooks require HTTPS locally

**Problem**: Clerk's webhook retries HTTPS only. `localhost:4000` won't work.

**Fix**: `ngrok http 4000`, register the tunnel URL in the Clerk dashboard, add tunnel URL to API CORS allowlist. Wired as an npm script (`npm run tunnel:api`).

**Lesson**: any SaaS with webhooks expects you to tunnel. Know ngrok, localtunnel, cloudflared, smee.io — the specific tool matters less than knowing *why* (HTTPS requirement, public DNS requirement).

### 4.6 PDF signature placement works on web, breaks on mobile (again, months later)

**Second occurrence of 4.1 — but different root cause**.

This time: a CSS rule `[data-audience="patient"] button { min-height: 44px }` (intended to make patient-facing buttons touch-friendly) was also applying to field overlay buttons, stretching small signature fields to 44px, which broke the percentage-position math for any field under 44px's worth of percentage.

**Fix**: added a `data-field-overlay` attribute on overlay buttons, excluded it from the min-height rule in `globals.css`. Left a comment explaining the coupling.

**Lesson**: global CSS rules that target elements by semantic attribute (`[data-audience="patient"]`) are load-bearing across unrelated features. Every such rule should have an opt-out pattern documented alongside it. This is why I keep the comment in `globals.css` about `[data-field-overlay]` — the next engineer (or future-me) needs to know.

### 4.7 Token security: what goes on the wire vs. what's on disk

**Decision**: 32-byte `crypto.randomBytes()` token, base64url-encoded in the email URL. On the DB side, only `sha256(token)` is stored as `tokenHash` (with a unique index for fast lookup). TTL of 7 days. `signedAt` being non-null invalidates the token.

**Why**:
- Raw in URL: patients copy-paste links; can't ask them to "log in"
- Hashed at rest: a dump of the DB doesn't hand attackers valid tokens
- 32 bytes = 256 bits of entropy, unguessable in practical time
- Single-use: prevents replay after sign

**Lesson**: any time you find yourself writing "magic link", think about what happens if (a) the URL leaks in a log, (b) the DB leaks, (c) the link is retried. Bind each to a different mitigation.

**Study**: OWASP Session Management Cheat Sheet.

### 4.8 Silent HIPAA-adjacent decisions

- **No hard deletes**: `/documents/:id` is `VOIDED`, not `DELETE FROM`. Audit rows always survive.
- **No logging of email/name**: would write PHI to CloudWatch. Pino's serializers are restrictive by default; need a review before adding any log field that includes a user-facing string.
- **KMS customer-managed key** instead of AWS-managed: necessary for key rotation controls and CloudTrail-visible usage (proves who touched what)

**Lesson**: these aren't features, they're *default postures*. If you demo this to a clinician and can't articulate them in one sentence each, you've lost.

---

## 5. Study plan: books, papers, courses, source code

Ordered by signal-to-noise for someone with 4y experience targeting Stripe/Anthropic/Uber/etc.

### 5.1 Books (in the order I'd read them)

1. **Designing Data-Intensive Applications** — Martin Kleppmann
   Every senior backend engineer cites it. Read all 12 chapters. The partitioning / replication / transactions chapters are the densest. Do the "imagine you had to explain this to an interviewer" exercise for each concept.
2. **Database Internals** — Alex Petrov
   Complement to Kleppmann. Deeper on B-trees, LSM-trees, WAL, MVCC. Read it with Postgres source code open in a tab.
3. **Systems Performance (2nd ed.)** — Brendan Gregg
   For the operations mindset. USE method, flame graphs, how to reason about where cycles actually go. Not optional if you want to do SRE-flavored interviews.
4. **Site Reliability Engineering** — Google (free online)
   SLOs, error budgets, post-mortems, on-call. The industry vocabulary comes from here.
5. **Designing Distributed Systems** — Brendan Burns
   Patterns: sidecar, ambassador, adapter, leader election. Short, practical.
6. **The Missing README** — Chris Riccomini
   Practical engineering habits. Quick read. Good for "what they don't teach in school".

### 5.2 Papers (start with these five)

1. **Raft** — "In Search of an Understandable Consensus Algorithm" (Ongaro, Ousterhout)
   The consensus algorithm you'll see referenced most often. Pair with the MIT 6.824 Raft labs.
2. **Dynamo** — Amazon's eventually-consistent KV paper
   Consistent hashing, gossip, vector clocks. The "AP in CAP" reference design.
3. **Spanner** — Google's globally-distributed SQL
   TrueTime, Paxos for replication. The "CP that kind of feels like CA" design.
4. **MapReduce** — Dean & Ghemawat
   Old but foundational. The conceptual parent of every batch-processing system since.
5. **The Google File System** — Ghemawat, Gobioff, Leung
   GFS → HDFS lineage. Design for commodity hardware with failures as the norm.

Reading order: Raft → GFS → MapReduce → Dynamo → Spanner. Each one ~20 pages, each readable in a sitting.

[Papers We Love](https://paperswelove.org/) has more once you want to go deeper.

### 5.3 Courses

1. **MIT 6.824 — Distributed Systems**
   Free lectures + labs on YouTube. Implement Raft in Go (labs 1–4). This is the single highest-signal course for distributed-systems interviews. Alumni of the course do disproportionately well at Google/Meta/Stripe infra.
2. **CMU 15-445 Database Systems**
   Free. If you want to understand what Prisma hides from you, this is the course. Pair with the [Bustub](https://github.com/cmu-db/bustub) project to implement a real DBMS.
3. **Stanford CS 144 — Networking**
   Free. Build a TCP implementation from scratch. The kind of course senior screens assume you've internalized.

### 5.4 Production source code to read

Don't read Linux or Chromium; they're too big. Pick one and actually follow control flow:

- **Redis** — 60k LOC of C. Event loop, object system, replication. Legible.
- **SQLite** — famously well-commented, 150k LOC of C, test suite bigger than the code. Read the architecture doc first.
- **etcd** — Go, understandable, Raft in practice.
- **vLLM** — Python, model serving. Essential if you want AI-infra roles. Read `scheduler.py` and `block_manager.py`.
- **Envoy** — C++ proxy. If you want to deeply understand networking middleware. Harder.
- **CockroachDB** — Go, distributed SQL. Combines Raft + MVCC + SQL. Extremely ambitious codebase.

Pick one, read one subsystem (not the whole thing), write a 2-page write-up of what you learned. The write-up is the study.

### 5.5 Blogs worth subscribing to

- [AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/)
- [Stripe Engineering](https://stripe.com/blog/engineering)
- [Cloudflare Blog](https://blog.cloudflare.com/) — some of the best networking content on the web
- [Dropbox Tech](https://dropbox.tech/)
- [Uber Engineering](https://www.uber.com/blog/engineering/)
- [Discord Engineering](https://discord.com/category/engineering) — for the scale-out write-ups
- [Brendan Gregg's blog](https://www.brendangregg.com/) — perf + observability
- [High Scalability](http://highscalability.com/) — aggregated industry case studies

### 5.6 Interview-prep specific

- **Alex Xu — System Design Interview vol. 1 & 2**: read for vocabulary and common patterns. Don't treat as gospel; do treat as a shared dictionary.
- **Hello Interview**: most focused system-design practice platform. Worth paying for.
- **Designing Machine Learning Systems** — Chip Huyen: if you're going for AI eng roles, this is the one. Covers serving, batching, drift, evaluation.
- Mock with humans, not just yourself. Set up weekly swaps with other senior candidates.

---

## 6. Weekly schedule

Assuming ~8h/week of study (adjust). Key: every study hour should produce an artifact — either a commit to this repo or written notes. Otherwise it evaporates.

| Week | Topic | Artifact |
|---|---|---|
| 1 | Kleppmann ch. 1–4 (foundations) | 2-page notes on replication lag |
| 2 | Kleppmann ch. 5–7 (replication, partitioning, transactions) | Load test `/documents`, document the breaking point |
| 3 | Observability: add OpenTelemetry to this repo | Traces visible in Honeycomb dev account |
| 4 | MIT 6.824 lectures 1–4 + Lab 1 (MapReduce) | Lab passes |
| 5 | Raft paper + MIT 6.824 lectures 5–7 | 1-pager explaining Raft leader election |
| 6 | MIT 6.824 Lab 2 (Raft) | Lab passes (hardest lab — budget 2 weeks if needed) |
| 7 | Add BullMQ/SQS queue to this repo for PDF rendering | Async sign flow working end-to-end |
| 8 | SRE book ch. 1–5 (monitoring, SLOs) | SLOs defined for this repo + dashboard in Grafana |
| 9 | Add idempotency keys to write endpoints | Stripe-style pattern, with tests |
| 10 | Dynamo + Spanner papers | 1-pager comparing consistency models |
| 11 | System design mock: "Design a Stripe webhook delivery system" | Whiteboard written up |
| 12 | Postgres internals: MVCC, vacuum, index types | Notes tied back to specific queries in this repo |

After week 12: repeat with harder material (CMU 15-445, distributed transactions, streaming systems).

---

## Closing

The point of this repo is no longer to be a signing app. It's to be a laboratory for the engineering practices you're studying. Every improvement above is the kind of work you'd do in the first 6 months on the job at a company that cares. Doing them on your own code, with no pressure, gives you the space to do them *well*.

Pick one track at a time. Finish it. Write about it. Move on.
