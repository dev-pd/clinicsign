# ClinicSign — project walkthrough

A reference document for myself: feature-by-feature implementation, the *why* behind every meaningful decision, what I'd do differently, and how to talk about it in an interview without bullshitting.

This is the doc I'd hand to a senior engineer reviewing the project, not a marketing page.

---

## Contents

1. [The product in one paragraph](#1-the-product-in-one-paragraph)
2. [The problem](#2-the-problem)
3. [Architecture at a glance](#3-architecture-at-a-glance)
4. [Stack and numbers](#4-stack-and-numbers)
5. [Feature-by-feature implementation](#5-feature-by-feature-implementation)
6. [Infra: what I picked and what I rejected](#6-infra-what-i-picked-and-what-i-rejected)
7. [The interesting bugs](#7-the-interesting-bugs)
8. [What I'd do differently with another month](#8-what-id-do-differently-with-another-month)
9. [Resume bullets — three lengths](#9-resume-bullets--three-lengths)
10. [Interview prep: what to lead with, what to expect](#10-interview-prep-what-to-lead-with-what-to-expect)

---

## 1. The product in one paragraph

ClinicSign is a small, single-tenant signing tool for clinics: upload a PDF, drop fields onto it (signature, initials, date, text, checkbox), email a one-time-use link to the patient, the patient signs from any device with no account, the rendered PDF lands in S3 with a complete audit trail in Postgres. The clinician and the patient see two completely different UIs; the only thing they share is a token.

It's deployed: Vercel for the Next.js frontend, AWS (ECS Fargate behind CloudFront, RDS Postgres, S3 with KMS) for the API.

---

## 2. The problem

DocuSign and Adobe Sign are the dominant solutions. They're enterprise tools with enterprise pricing and enterprise UX. A small clinic that needs to sign 20 consent forms a month doesn't want a 30-second login flow for every patient and a per-envelope fee.

ClinicSign demonstrates a leaner shape:

- **Patients don't have accounts.** They have a tokenized link, valid for 7 days, single use.
- **The clinic owns its data.** Single tenant per clinic; PHI stays in *one* customer-managed-key S3 bucket and *one* Postgres database.
- **The audit log is structural, not bolted on.** Every interesting state change writes a row. The dashboard's activity timeline reads directly from it.

That's the design thesis. Whether or not it's a business is a separate question; the engineering question is *can you build this safely* — and "safely" means HIPAA-shaped controls without paying for HIPAA-grade tooling on day one.

---

## 3. Architecture at a glance

```
┌─────────────────────┐     HTTPS      ┌─────────────────────┐
│  Clinician browser  │ ─────────────► │  Vercel (Next.js)   │
└─────────────────────┘                └──────────┬──────────┘
                                                  │
                                       Server actions / fetch
                                                  ▼
                                       ┌─────────────────────┐
                                       │   CloudFront (TLS)  │
                                       └──────────┬──────────┘
                                                  │ HTTP
                                                  ▼
                                       ┌─────────────────────┐
                                       │  ALB (private VPC)  │
                                       └──────────┬──────────┘
                                                  ▼
                                       ┌─────────────────────┐
                                       │   ECS Fargate task  │
                                       │   Express + Prisma  │
                                       └──┬───────────┬──────┘
                                          │           │
                                          ▼           ▼
                                  ┌──────────┐  ┌──────────┐
                                  │ RDS PG   │  │ S3 (KMS) │
                                  │ private  │  │ versioned│
                                  └──────────┘  └──────────┘

       ┌─────────────────────┐     HTTPS      ┌─────────────────────┐
       │  Patient browser    │ ─────────────► │  Vercel /sign/:tok  │
       └─────────────────────┘                └──────────┬──────────┘
                                                         │
                                                         ▼
                                                  (same backend path)
```

### Principles that drove it

1. **Patient simplicity over clinician simplicity.** When in doubt, the patient experience wins; the clinician is paid to use the tool, the patient isn't.
2. **Explicit boundaries.** Every API response is shaped at the service layer; routes don't leak Prisma rows. Every env var is Zod-validated at boot.
3. **Audit trail as a first-class model, not an afterthought.** The `AuditLog` table existed before the dashboard.
4. **Pure-JS PDF pipeline.** No headless Chrome, no native dependencies. `pdf-lib` for rendering server-side, `pdf.js` (via `react-pdf`) for displaying client-side.
5. **Private-by-default infra.** RDS in private subnets, KMS-encrypted bucket, no public S3 access, ALB ingress restricted to CloudFront in production.
6. **No hard deletes for anything that touched a patient.** Void replaces delete. Audit rows are append-only.

---

## 4. Stack and numbers

### Stack

| Layer | Choice | Why this not the alternative |
|---|---|---|
| **Monorepo** | pnpm + Turborepo | Single-source config, fast cache, shared types via `packages/shared-types` |
| **Frontend framework** | Next.js 16 (App Router) | RSC + server actions for SSR-safe auth; Vercel deploys are zero-config |
| **UI** | shadcn/ui + Tailwind v4 | Component code lives in *my* repo (no vendor opacity), tokens in `globals.css` |
| **Auth** | Clerk | Webhooks for DB sync, hosted UIs, free tier sufficient. (Not HIPAA-BAA on free.) |
| **State / data fetching** | TanStack Query | Cache invalidation by query key, optimistic updates, retry policy per mutation |
| **Forms / validation** | react-hook-form + Zod | Same Zod schemas reused on the API for symmetry |
| **API framework** | Express 4 | Boring, well-understood. Fastify would have ~30% better throughput; not the bottleneck. |
| **ORM** | Prisma | Type-safe queries, idempotent migrations, migrate-on-deploy ergonomics |
| **DB** | RDS Postgres 16 | Single primary, db.t4g.micro for demo, no replicas yet |
| **Storage** | S3 with customer-managed KMS key | Versioned bucket, BlockPublicAccess fully on |
| **PDF render (server)** | pdf-lib | Pure JS, no Chromium; runs inside Node Fargate task |
| **PDF render (client)** | pdfjs-dist via react-pdf | Worker offloads rendering off the main thread |
| **Logging** | Pino + pino-http | Structured JSON, correlation IDs, ships to CloudWatch via stdout |
| **IaC** | Pulumi (TypeScript) | Same language as the app; Output<T> composability beats HCL string interpolation |
| **Email** | Resend | Simple API, React Email components ready (deferred), free tier sufficient |
| **Edge** | CloudFront | TLS termination + edge caching for static, single API origin behind it |

### Numbers

| What | Count |
|---|---|
| Prisma models | 6 (`Clinic`, `User`, `Document`, `Field`, `DocumentRecipient`, `AuditLog`) |
| Prisma enums | 4 (`DocumentStatus`, `FieldType`, `ActorType`, `EventType`) |
| Audit event types | 11 |
| API route handlers | 13 (across `me`, `documents`, `sign`, `health`) |
| API service modules | 10 |
| Pulumi LOC (TypeScript, single file) | 758 |
| Schema LOC | 142 |
| Frontend `.ts/.tsx` files | 50 |
| Backend `.ts` files | 28 |
| Migrations applied at deploy | 1 (consolidated init) |

These are *honest* numbers, not vanity. Real point: this is a small codebase doing a focused thing, not a kitchen sink.

---

## 5. Feature-by-feature implementation

For each feature: **what it does**, **how it's wired**, **the tradeoff I'd defend**, **what I'd improve**.

### 5.1 Clinician sign-in (Clerk + webhook → DB sync)

**What**: clinicians sign in with Clerk's hosted UI. On their first successful sign-in, Clerk fires a `user.created` webhook to our API; the handler upserts a `User` row and a `Clinic` row.

**How wired**:
- `@clerk/nextjs` on the frontend; the `<ClerkProvider>` wraps the app
- `clerkMiddleware()` from `@clerk/express` on the backend protects `/api/*` routes (except `/api/sign/*` and `/api/health`)
- Webhook endpoint at `/api/clerk/webhooks` verifies the Svix signature, parses the event, calls `userSyncService.upsert(clerkUser)`
- The webhook is the *source of truth* for User/Clinic creation — the API never auto-creates on first authenticated request, because that's a race condition

**Tradeoff I'd defend**: using Clerk instead of rolling auth.
- Pro: hosted UI, MFA, session management, secure password storage all "for free"; lets me focus on the signing pipeline
- Con: lock-in, BAA requires their paid plan, opaque to senior reviewers who want to see "did you build a session store from scratch"
- Defense: for a demo, the time savings (≈40 hours of careful crypto + UI work) buys me the capacity to build the bits that actually demonstrate engineering judgment (the audit trail, the field placement editor, the Pulumi infra). Clerk → JWT-validating-middleware is a one-day swap if it ever needs to come out.

**What I'd improve**: webhook handler retries + dead letter queue. If our API is down when Clerk fires, the user signs in but has no DB row, which surfaces as a confusing 500 from `/api/me`. Clerk *will* retry, but I'd add an idempotency table to make sure we don't double-process on retry.

---

### 5.2 Document upload (S3 + KMS)

**What**: clinician picks a PDF (≤10MB), the API streams it through `multer` (memory storage), generates a UUID, writes to S3 at `clinics/{clinicId}/documents/{docId}/original.pdf`, records a `Document` row with status `DRAFT`.

**How wired**:
- Frontend: `<PdfDropzone>` client component handles drag + drop + size validation; pre-renders a thumbnail with `pdf.js` so the user sees their document immediately
- Backend: `multer.memoryStorage()` (PDFs are small enough; not streaming because we need to compute checksum + page count first)
- `s3.service.ts` constructs the S3 PutObject; bucket has `Bucket.encryption = AES256` plus an explicit per-object `ServerSideEncryption: "aws:kms"` with the customer-managed key ARN
- `Document` row stores `originalPdfKey` (not a presigned URL — those are generated on read)

**Tradeoff I'd defend**: memory storage in multer instead of streaming to S3.
- Pro: simpler error handling, can compute SHA-256 of the upload for audit, can validate it's actually a PDF before paying S3 PUT cost
- Con: 10MB × N concurrent uploads sits in task memory. At Fargate's 0.5 vCPU / 1GB this is fine for demo; at scale we'd switch to multipart upload with presigned URLs and let the browser PUT directly to S3
- Defense: the upload throughput isn't the bottleneck for a clinic doing 20–200 documents/day. Premature optimization.

**What I'd improve**: presigned upload URLs, virus scanning (ClamAV in a sidecar or AWS Macie), MIME sniffing instead of trusting the file extension.

---

### 5.3 Field placement editor (the most interesting frontend piece)

**What**: clinician sees the PDF rendered by `react-pdf`. They pick a tool (Signature / Text / Date / Checkbox / Initial), click on a page, a field overlay appears at that location. They can drag, resize, multi-select, snap to a grid, and align to other fields' edges. Required toggle per field. Save persists fields with **percentage coordinates** (x, y, w, h relative to the page).

**Why percentage coordinates**: the PDF renders at different widths on different devices. Percentage means "65% of the page width from the left, 30% from the top, occupying 20% of the page width" — independent of the rendered pixel width. Server-side, `pdf-lib` knows the PDF's true point dimensions (1 point = 1/72 inch); to render a value at the field, we multiply percentage × PDF width-in-points. Clean math, device-independent.

**How wired**:
- `document-pdf-editor.tsx` is the controller; it owns the array of fields in component state
- Each `<Page>` from `react-pdf` is wrapped in a measurement div whose width is observed with a `ResizeObserver` attached via a **callback ref** (see §7.1 for why a callback ref, not a `useRef`)
- Click on the page with a tool armed → compute `(clickX / pageWidth, clickY / pageHeight)` → push a new field with default size for that field type
- Drag implementation: HTML5 `dragstart` / `dragover` / `drop` doesn't work for pixel-precise dragging; used native pointer events (`onPointerDown` / `onPointerMove` / `onPointerUp` with `setPointerCapture` so the drag continues even if the cursor leaves the element)
- **Snap-to-grid**: 8px increments by default; modifier key (`G`) disarms snap mid-drag
- **Align-to-siblings**: while dragging, find any sibling field within 4px on each axis; magnetize and render an alignment guide line
- **Multi-select**: shift-click to add/remove from selection; arrow keys move the whole selection by 1px (or 8px with shift)
- **Required toggle** per field (`R` key) writes to the field's `required` boolean
- **Copy/paste** (`⌘C` / `⌘V`) duplicates the selected field at a 16px offset

**Tradeoff I'd defend**: hand-rolled editor instead of using a canvas library (Konva, Fabric.js).
- Pro: total control over keyboard shortcuts, accessibility, alignment behavior; small bundle (no canvas runtime); works with React's reconciliation
- Con: I had to implement drag, multi-select, snapping, and alignment myself
- Defense: the field editor *is* the differentiator UI-wise. Outsourcing it to a canvas library would have meant fighting the library every time I wanted a specific behavior. The complexity is bounded — ≈600 LOC including all interactions.

**What I'd improve**: undo/redo via a command stack. Currently the editor is destructive — drag a field by accident and the only recovery is reload-without-saving. Command pattern with a 50-action history would be 80 LOC and a major UX win.

---

### 5.4 Send for signature (token + email)

**What**: clinician clicks Send. The API generates a 32-byte random token, hashes it (SHA-256), writes the hash + an expiry to `DocumentRecipient`, sets `Document.status = SENT`, sends the patient an email with a link of the form `https://app/sign/<raw-token>`.

**Token security model**:
- **Raw token in URL**: 32 bytes of `crypto.randomBytes()` → base64url encoded (~43 chars). 256 bits of entropy: unguessable.
- **Hashed at rest**: only `tokenHash = sha256(rawToken)` is stored. A DB dump doesn't grant access.
- **TTL**: 7 days. Server-enforced; `expiresAt` is checked on every patient request.
- **Single-use**: once `signedAt` is set, the token is dead. Reuse → 410 Gone.
- **Tied to a recipient and document**: looking up `tokenHash` returns the recipient + document atomically.

**Email pipeline**:
- `email.service.ts` wraps Resend
- Templates are inline HTML for now (React Email is set up but not wired); subject + body include the clinic name, document title, and link
- Failures bubble up as an error; the API responds 502 if email fails. *This is wrong* — see §8 (queue improvement).

**Tradeoff I'd defend**: not requiring patient login for signing.
- Pro: zero-friction patient experience. No account, no MFA, no password reset, no abandonment.
- Con: token leak = signing access. Mitigated by 7-day TTL, single-use semantics, and the fact that "PHI" here is the document the patient is signing — they already have it.
- Defense: this is industry standard for healthcare consent and DocuSign-style envelopes. The threat model is correct: links are sent to an email account that proves identity (the same way password resets do).

**What I'd improve**: queue the email send (so the HTTP request doesn't wait); idempotency key on `/send` so a double-click doesn't fire two emails; magic-link rotation if the patient says "I lost it, send me a new one" (today: just send a new email, but the *first* link is still live until expiry).

---

### 5.5 Patient signing flow (the most important UX)

**What**: patient clicks the email link, lands on `/sign/<token>`. Sees the PDF with their fields highlighted. Fills in each field. Clicks "Submit". Sees a completion screen.

This is the user journey the demo lives or dies on.

**How wired**:

1. **Token verification** (`GET /api/sign/:token`)
   - SHA-256 the path param, look up `DocumentRecipient.tokenHash`
   - Reject with structured 4xx if expired/used/missing (specific codes so the UI can render specific messages — "this link has already been signed", "this link expired on X")
   - On success, write `AuditLog: DOCUMENT_VIEWED` (only on first view; idempotent via the recipient's `firstViewedAt`)
   - Return: presigned S3 URL (5-minute TTL) for the original PDF, list of fields, recipient + clinic display info

2. **PDF render** (`patient-signing-client.tsx`)
   - Uses `react-pdf` like the editor, but read-only
   - The page wrapper is *always* mounted (originally was conditional behind a loading guard — see §7.1) so the `ResizeObserver` callback ref attaches before the PDF resolves
   - Fields render as absolutely-positioned overlay buttons computed from percentage coordinates × measured page width

3. **Field interaction**
   - Signature: opens a modal with `react-signature-canvas`, captures stroke data, renders as a base64 PNG inside the field overlay
   - Initials: same modal, smaller default size
   - Date: defaults to today, editable
   - Text: inline `<input>` inside the overlay
   - Checkbox: click to toggle

4. **Signing-guidance polish** (added later)
   - Progress indicator: "X of Y required complete"
   - Pulsing "Sign here" pill on the next required, unfilled field
   - Auto-scroll to the next field after one is completed
   - Submit button disabled until all required fields are filled
   - Sticky bottom bar on mobile so the submit button is always reachable

5. **Submit** (`POST /api/sign/:token/complete`)
   - Validates that every required field has a value (server-side, not just client-side)
   - For each field, persists the value
   - Loads the original PDF from S3
   - For each field, draws the value into the PDF using `pdf-lib`:
     - Signature/Initials: embed the PNG, draw at field rect
     - Text/Date: draw text with a built-in font at field rect
     - Checkbox: draw a checkmark glyph
   - Writes the rendered PDF to S3 at `clinics/{cid}/documents/{did}/signed.pdf`
   - Updates `Document.status = SIGNED`, `signedAt = now`, `signedPdfKey = <s3 key>`
   - Writes `AuditLog: DOCUMENT_FIELD_FILLED` (one per field) and `AuditLog: DOCUMENT_SIGNED`
   - Sends the completion email
   - Returns `{ status: "signed", signedAt }`

6. **Completion screen**: fixed; explains what happened next ("the clinic has been notified, your signed copy will arrive by email").

**Tradeoff I'd defend**: doing the PDF render synchronously inside the request handler.
- Pro: simplest possible implementation; no queue; status transitions are atomic with the request
- Con: p99 latency = render latency (worst case 5–10s for a multi-field PDF); email failures fail the request
- Defense: at demo scale this is fine. At real scale this is the first thing I'd async (see [BACKEND_IMPROVEMENT_PLAN.md §2.2](./BACKEND_IMPROVEMENT_PLAN.md)).

**What I'd improve**: async queue (BullMQ or SQS), idempotency key on submit (re-submit safety), client-side optimistic state (show "signing…" immediately, don't block on render).

---

### 5.6 Audit log (the underrated feature)

**What**: a single append-only table that records every interesting event with `{ documentId, actorType, actorId?, eventType, metadata, timestamp }`. The dashboard's activity timeline reads from here directly. Whenever a developer is tempted to log "FYI" data, the right place is `AuditLog`, not Pino.

**Schema** (relevant bit):
```prisma
model AuditLog {
  id          String     @id @default(cuid())
  documentId  String
  document    Document   @relation(fields: [documentId], references: [id], onDelete: Cascade)
  actorType   ActorType  // PROVIDER | RECIPIENT | SYSTEM
  actorUserId String?
  actorRecipientId String?
  eventType   EventType
  metadata    Json?
  ipAddress   String?
  userAgent   String?
  timestamp   DateTime   @default(now())

  @@index([documentId, timestamp])
}
```

**Convention enforcement**: there is no `update` or `delete` call site for `AuditLog` anywhere in the codebase. Code review catches this; ideally a Postgres trigger would too (improvement). 

**11 event types**:
```
DOCUMENT_CREATED, DOCUMENT_SENT, DOCUMENT_VIEWED, DOCUMENT_FIELD_FILLED,
DOCUMENT_SIGNED, DOCUMENT_EXPIRED, DOCUMENT_VOIDED, DOCUMENT_RESENT,
DOCUMENT_DOWNLOADED, AI_FIELDS_DETECTED, AI_SUMMARY_GENERATED
```

The two `AI_*` events are forward-looking — reserved so adding AI features later doesn't require a schema migration to backfill old rows.

**Tradeoff I'd defend**: storing audit events in the same Postgres database as application data, instead of a dedicated event store.
- Pro: one transaction commits both the state change and the audit row → no possibility of "we updated the doc but lost the audit record"
- Con: scaling the audit table is a problem when you have millions of rows per day. We're nowhere near that.
- Defense: at demo scale, transactional consistency is worth more than scale headroom we won't use. The fix at scale is a nightly archival job to S3 + a partition strategy.

**What I'd improve**: hash chain (`prevHash` column) so tampering is detectable; separate read replica for compliance queries that scan the whole table.

---

### 5.7 Dashboard

**What**: the clinician's home. KPI strip (drafts / out / signed / ended), an "attention" banner for stale or expiring documents, a search-and-filter bar, a paginated table of every document.

**The bits worth pointing out**:
- KPIs are computed client-side from the loaded list — no separate aggregation endpoint. At our scale (≤1000 docs per clinic) this is fine; at scale it'd be a `GET /clinics/me/stats` endpoint with materialized counters.
- The attention banner runs three rules over the list: stale-out-for-signature (>3 days, not viewed), opened-but-unsigned (viewed >2 days ago, not signed), expiring-soon (expires <24h). Each maps to a CTA.
- Filter chips, search input, and tab filters compose; client-side filtering keeps the UX responsive
- Pagination is client-side over the loaded list (PAGE_SIZE = 10). Backend-side pagination is a 1-day improvement, deferred until we have customers.
- **Sticky title column + horizontal scroll** for the data table: the title stays visible as you scroll the other columns, so a row with a long title is still identifiable. Implemented with `position: sticky; left: 0` plus a careful `z-index` ladder (the sticky cell needs `z-30`, the row hover background can't be transparent or the content underneath bleeds through — see §7.5).
- **Inline row actions** instead of a `...` dropdown: Open / Remind / Void are all directly in the row. One click each. Remind only renders if the doc is `SENT` or `VIEWED`; Void only if not `SIGNED`/`EXPIRED`.

**Tradeoff I'd defend**: client-side everything (KPIs, filters, pagination).
- Pro: instant UX, simple endpoints, no aggregation logic to maintain
- Con: doesn't scale past a few thousand documents per clinic
- Defense: that's exactly when I'd add a dashboard endpoint. Building it now is YAGNI.

**What I'd improve**: backend-side pagination + filtering with cursor-based paging; saved filters; bulk actions.

---

### 5.8 Document detail view

**What**: a single document. PDF preview on the left, status timeline + recipient info + actions on the right. Tabs for Preview and Activity (audit log timeline).

**The bits worth pointing out**:
- The activity timeline reads `AuditLog` directly — no synthesis, no derivation. If you can't see it in the timeline, it didn't happen.
- Times are absolute local datetimes (`Apr 22, 2026, 9:59:40 AM PDT`) instead of relative ("2 hours ago"). Relative times feel friendly until you're trying to correlate against something else; then they're useless.
- The Void action is destructive; it's gated behind a confirmation dialog explaining that voided documents are kept for compliance but no longer signable.

---

### 5.9 Void flow (the HIPAA-shaped one)

**What**: a `Document` is never deleted. Voiding sets `status = VOIDED`, `voidedAt = now()`, writes an audit row, and rejects any future `/sign/:token` requests for that document with a clear message.

**Why**: HIPAA-shaped systems treat patient-related records as retain-forever-with-justification. Hard delete erases evidence. If a regulator (or a court) asks "did you sign this consent form?", "we deleted it" is not an acceptable answer.

**Allowable transitions**:
- `DRAFT` → `VOIDED` (no patient ever saw it)
- `SENT` → `VOIDED` (link revoked)
- `VIEWED` → `VOIDED` (link revoked even if patient looked)
- `SIGNED` → cannot be voided (it's signed; create a new document for amendments)
- `EXPIRED` / `VOIDED` → no-op

---

## 6. Infra: what I picked and what I rejected

For each pair, the alternative I'd pick under different constraints.

### 6.1 ECS Fargate vs Lambda

**Picked**: Fargate.
**Why**: long-running container, persistent connection pool to RDS, no cold start, predictable cost.
**When I'd pick Lambda**: if the workload were spiky (occasional bursts), if every API call were independent (no DB), or if I wanted to push on cost down to ~$0 idle. Lambda + RDS without RDS Proxy is dangerous (connection storms); I didn't want that complexity.

### 6.2 RDS vs Aurora Serverless v2

**Picked**: RDS `db.t4g.micro`.
**Why**: cheaper at this scale (~$13/mo vs ~$45 minimum for Aurora SLS v2 even idle), simpler to reason about, single AZ is fine for demo.
**When I'd pick Aurora**: production with bursty load, multi-AZ requirement, want auto-scaling without thinking about it, OK paying the premium.

### 6.3 CloudFront in front of ALB vs ALB direct

**Picked**: CloudFront → ALB.
**Why**: TLS termination at the edge for free (ACM cert), DDoS shielding, ability to put static assets through the same hostname later, future WAF integration, the ALB's HTTP-only listener can be locked to CloudFront's origin-facing prefix list.
**When I'd skip CloudFront**: if I were OK with ALB serving HTTPS directly and didn't need edge caching. For a backend-only deployment the CloudFront layer is mostly there for the security perimeter, not perf.

### 6.4 Pulumi vs Terraform vs CDK

**Picked**: Pulumi (TypeScript).
**Why**: same language as the app code; `Output<T>` composes properly across resources without HCL string interpolation; can `import` and refactor like real TS; `pulumi state` ergonomics.
**When I'd pick Terraform**: if I were on a team that already used it (network effects), or if I wanted a richer module ecosystem (it has more), or if the team didn't speak TypeScript.
**When I'd pick CDK**: if I were AWS-only forever and wanted CloudFormation as the substrate.

### 6.5 pdf-lib vs Puppeteer vs PDFKit

**Picked**: pdf-lib.
**Why**: pure JS, no headless Chrome → no Chromium binary to manage in the container, much smaller image, no GPU/font system to worry about. Good enough for the "draw text and PNGs at coordinates" use case.
**When I'd pick Puppeteer**: if I needed to render arbitrary HTML/CSS to PDF (template-based generation). I don't.

### 6.6 Single NAT Gateway vs NAT per AZ

**Picked**: single NAT.
**Why**: cost. ~$32/mo vs ~$96/mo for three. The cross-AZ data charges are negligible at our throughput.
**When I'd add per-AZ NATs**: if I had production multi-AZ traffic where an AZ failure should not take down outbound (since with single-NAT, an AZ outage means the other AZs lose internet for outbound calls).

### 6.7 In-AWS Resend vs SES

**Picked**: Resend.
**Why**: nicer DX, simpler setup, free tier generous enough for demo; built for transactional email developers.
**When I'd pick SES**: production scale, want to stay inside AWS for compliance, want to push deliverability config (warm-up, dedicated IP).

---

## 7. The interesting bugs

These are the "tell me about a hard bug you debugged" stories.

### 7.1 PDF coordinates drift on mobile (the callback ref story)

See [BACKEND_IMPROVEMENT_PLAN.md §4.1](./BACKEND_IMPROVEMENT_PLAN.md#41-pdf-field-coordinates-drifting-on-mobile) for the full retrospective. The short version: signature overlays were positioned at wrong percentages on mobile because the page-width-measurement effect was firing before the page DOM existed. Migrated `useRef + useEffect` to a callback ref; the callback fires deterministically on attach, after commit. First-paint coordinates correct on every device.

**Why this is interview-worthy**: it's a precise, technical answer to "tell me about a time you debugged something tricky" that demonstrates (a) you know React's lifecycle deeply, (b) you reach for instrumentation before guessing, (c) you understand the difference between "ref + effect" and "callback ref" — most React devs don't.

### 7.2 The `min-height: 44px` rule that broke field overlays

A CSS rule intended to make patient-facing buttons touch-friendly (`[data-audience="patient"] button { min-height: 44px }`) was also applying to the absolutely-positioned field overlays, stretching small signature fields and breaking the percentage-position math.

**Fix**: added `data-field-overlay` attribute on overlay buttons, excluded it from the rule.

**Lesson**: global CSS rules selecting on semantic attributes are load-bearing across unrelated features. They need an opt-out pattern *and* a comment explaining the coupling.

### 7.3 ECS task crashloop on first deploy (three different causes)

Documented in [BACKEND_IMPROVEMENT_PLAN.md §4.3](./BACKEND_IMPROVEMENT_PLAN.md#43-ecs-tasks-crashloop-on-first-deploy). Three separate failure modes I hit on the first deploy: arch mismatch (M-series Mac builds arm64 by default, Fargate runs amd64), missing env var (Zod env parser exits the process before the ALB sees a healthy port), competing health checks (Dockerfile `HEALTHCHECK` racing with ALB target group).

**Why interview-worthy**: shows you understand the boundary conditions of containerized deployments. "First deploy almost never works" is senior-engineer wisdom.

### 7.4 RDS reachable from laptop without making it public (break-glass pattern)

RDS is `publiclyAccessible: false` for the right reasons; migrations during local dev still need a connection. Solution: an optional `rdsAllowedCidr` Pulumi config key that punches a single-CIDR hole in the RDS security group when set. Set it for local work, unset before any production deploy. Production runs migrations in the container entrypoint via `prisma migrate deploy`, so prod doesn't need a laptop at all.

**Why interview-worthy**: demonstrates that you think about how to reach private resources, and you know the alternatives (SSM Session Manager, bastion host, Client VPN, direct peering).

### 7.5 Sticky table cell visual overlap on scroll

Subtle one. The dashboard table has a sticky title column; rows have a `hover:bg-muted/50` Tailwind class that uses *50% opacity* on hover. When you hovered a row and scrolled horizontally, the sticky title cell also got the semi-transparent hover background, and the scrolling cells' solid backgrounds bled through it.

**Fix**: keep the sticky cell at solid `bg-card` always (no hover transparency on it); bump its `z-index` to `z-30` to sit above scrolling siblings.

**Lesson**: any time you stack `sticky` + `transparent backgrounds` + `hover states`, draw the z-index ladder explicitly. Tailwind's defaults are fine until you compose three orthogonal features at once.

---

## 8. What I'd do differently with another month

In rough order of impact:

1. **Async PDF render via SQS + a worker service.** The single biggest reliability + UX improvement. Patient sees "signed" instantly; rendering happens in a background job with retries.
2. **OpenTelemetry from day one.** I'd want traces for every request before the first deploy. The cost of bolting it on later is real.
3. **Switch from inline IAM user to ECS task role.** It's already provisioned in Pulumi; the API just needs to drop the explicit access keys.
4. **Secrets Manager for everything sensitive.** Currently env vars are inline in the task definition.
5. **Idempotency keys on every write endpoint.** Stripe pattern. Makes retries actually safe.
6. **Integration tests with testcontainers.** Real Postgres, real schema, real services. The kind of test that catches a migration regression before deploy.
7. **Backend-side pagination with cursor paging.** Client-side will fall over the moment a real customer has 5,000+ documents.
8. **API versioning prefix (`/v1`).** Prepares for future breaking changes without a coordinated client deploy.
9. **Audit log hash chain.** Tamper-evident audit trail; impressive in security reviews.
10. **WAF in front of CloudFront.** AWS managed rule sets cover SQLi/XSS/bot control with ~3 lines of Pulumi.
11. **VPC endpoints for S3/ECR/CloudWatch.** Cheaper than NAT, no public internet hop for AWS-internal traffic.
12. **Lock ALB ingress to CloudFront prefix list.** Today the ALB SG accepts `0.0.0.0/0:80`; should be the CloudFront-origin-facing prefix list only.

These aren't *needed* to demonstrate the project; they're what you'd do if this were going into production tomorrow.

---

## 9. Resume bullets — three lengths

Pick the one that fits the resume slot.

### Short (one line)

> **ClinicSign** — Built and deployed a HIPAA-shaped patient signing app on AWS (ECS Fargate, RDS, S3+KMS, CloudFront) with Pulumi IaC; Next.js + Clerk + Express + Prisma; private VPC, customer-managed encryption, append-only audit log.

### Medium (two-line bullet)

> **ClinicSign — full-stack signing platform (TypeScript, Next.js, Express, Prisma, AWS).** Designed and shipped a patient-signing service end-to-end: clinician dashboard with field-placement editor, account-less patient signing flow with hashed time-limited tokens, PDF rendering via pdf-lib, and a Postgres-backed append-only audit log for every state change. Production infra in Pulumi (ECS Fargate behind CloudFront, RDS in private subnets, S3 with customer-managed KMS).

### Long (project-section style)

> **ClinicSign — patient signing platform** (solo, ~6 weeks)
> *TypeScript · Next.js 16 · React 19 · Express · Prisma · PostgreSQL · AWS · Pulumi · Clerk · pdf-lib · pdfjs-dist*
>
> Built a single-tenant electronic-signature service for clinics from scratch and deployed it to production-shaped infrastructure on AWS.
>
> - **Backend** (Node.js, Express, Prisma): 13 typed REST endpoints, Zod-validated boundaries (request body, params, query, env), structured Pino logging with request correlation, 11-event-type append-only audit log, idempotent migrations on container boot.
> - **Frontend** (Next.js App Router, shadcn/ui, Tailwind v4): clinician dashboard (KPIs, attention banner, sticky-column data table with inline actions), drag-and-drop field placement editor with grid snap and align-to-siblings guides, account-less patient signing flow with single-use SHA-256-hashed tokens.
> - **PDF pipeline**: percentage-coordinate field model lets the same field render correctly on devices from 320px to 1920px; server-side rendering with `pdf-lib` (pure JS, no Chromium), client-side rendering with `pdfjs-dist` workers.
> - **Infrastructure as code** (Pulumi, TypeScript, ~760 LOC): VPC + public/private subnets, ECS Fargate behind CloudFront and ALB, RDS Postgres in private subnets, S3 with customer-managed KMS encryption, scoped IAM task role, ECR with lifecycle policy, structured stack outputs.
> - **Security posture**: customer-managed KMS key, BlockPublicAccess fully on, RDS not publicly accessible, hashed tokens at rest, no PHI in logs, void-instead-of-delete for compliance.

---

## 10. Interview prep: what to lead with, what to expect

### The three things I'd lead with

If a screener says "tell me about a project", I'd open with these three in this order:

1. **The audit log discipline.** "Every interesting state change writes a row to a single append-only table; the dashboard's activity feed reads it directly. That structure forced me to be explicit about what 'happened' means in the system, and it's the single thing I'd want to keep if I rewrote the codebase."
2. **The patient-doesn't-need-an-account pattern, with the token security model.** "32-byte random token in the URL; only the SHA-256 of the token is stored. 7-day TTL, single-use. Lets the patient sign from any device with one click; lets us cap the blast radius of a leaked link or a stolen DB dump."
3. **The security perimeter, walked top-to-bottom.** Browser → CloudFront (TLS) → ALB (HTTP, private VPC) → ECS Fargate (private subnets) → RDS (private, no public access) + S3 (KMS-encrypted, BlockPublicAccess on). I can name what enforces every boundary and what would happen if any one breaks. (Detailed in `infra/ARCHITECTURE.md`.)

### The five questions I expect

For each, the version of the answer I'd give:

**Q: Why did you not use [DocuSign / ZenDocs / Adobe Sign]?**
A: The point isn't to compete with them; it's to demonstrate that I can build the engineering thesis behind one — auth-less recipients, audit-first design, pure-JS PDF pipeline, security perimeter. I'd happily pitch this as a teaching tool, not a startup.

**Q: How would you scale this to 10× / 100× the load?**
A: First action: add observability (OpenTelemetry, traces, SLOs). Second: load test to find the actual bottleneck. Specifically, I expect the PDF render in the synchronous request path is the first thing to fall over — fix is SQS + worker. Third: pgBouncer or RDS Proxy in front of Postgres for connection pool reuse. Fourth: read replica for the dashboard's list query if it becomes hot. (Plan: `docs/BACKEND_IMPROVEMENT_PLAN.md`.)

**Q: How do you handle multi-tenancy?**
A: Today it's single-tenant per clinic. To go multi-tenant: every query gets a `clinicId` predicate, enforced via a per-request Prisma client extension that reads the current user's `clinicId` from middleware. Row-level security in Postgres as a defense in depth. The S3 key layout already includes `clinicId/` so blast radius of a misconfigured bucket policy is contained.

**Q: What happens if the database goes down?**
A: Health check returns 200 (it doesn't touch the DB), so ALB keeps routing — I'd rather return 5xx with a useful error than fail the health check and take the service offline entirely. Reads and writes 5xx with a structured `code: "DATABASE_UNAVAILABLE"`. Frontend has retry-with-backoff via TanStack Query. Pino logs the failure with the request ID for debugging.

**Q: What's the worst bug you hit?**
A: PDF field coordinates drifting on mobile (story in §7.1). It tested every assumption I had about React refs, ResizeObserver timing, and CSS transforms. The fix — migrating from `useRef` to a callback ref to guarantee deterministic measurement timing — was 6 lines. The diagnosis took half a day with an in-app debug overlay logging exact pixel measurements per page per render. Lesson: when a layout bug doesn't make sense, instrument numbers, not descriptions.

---

## Appendix: file map for the curious

```
clinicsign/
├── apps/
│   ├── api/                      # Express + Prisma backend
│   │   ├── src/
│   │   │   ├── routes/           # 4 routers, 13 handlers
│   │   │   ├── services/         # 10 service modules
│   │   │   ├── middleware/       # auth, validation, errors, request-id
│   │   │   ├── config/           # Zod env parsing
│   │   │   └── server.ts         # bootstrap
│   │   └── prisma/
│   │       ├── schema.prisma     # 6 models, 4 enums
│   │       └── migrations/       # consolidated init
│   └── web/                      # Next.js 16 frontend
│       ├── app/
│       │   ├── (dashboard)/      # clinician routes
│       │   ├── sign/[token]/     # patient flow
│       │   └── api/clerk/        # webhook receiver
│       ├── components/
│       │   ├── dashboard/        # editor, command center, detail view
│       │   ├── signing/          # patient signing client
│       │   └── ui/               # shadcn primitives
│       └── lib/                  # api-client, types, pdf-worker
├── infra/
│   ├── src/index.ts              # 758-line Pulumi program
│   ├── ARCHITECTURE.md           # detailed infra doc
│   ├── AWS_SETUP_GUIDE.md        # step-by-step deploy guide
│   └── README.md                 # infra index
├── packages/
│   └── shared-types/             # types shared between api and web
└── docs/                         # this file + the backend plan
```
