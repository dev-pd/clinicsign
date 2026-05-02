# ClinicSign - Project Specification

## What we are building

A HIPAA-aware document signing platform for small and medium medical practices. Providers sign in with Google, upload a PDF form, place signature and text fields on it, send it to a patient via email, and the patient signs in their browser without needing to create an account. The final signed PDF is stored securely and both parties get a copy.

This is a vertical slice of PandaDoc targeted at healthcare. Scope is deliberately narrow to demonstrate production-quality engineering over feature breadth.

## Build philosophy

Two phases. Do not start Phase 2 until Phase 1 is working end-to-end.

- **Phase 1 - Core (priority)**: end-to-end signing flow working locally and deployed. Clerk auth, document upload, field placement, send via email, patient signs, signed PDF generated, audit log, dashboard shows status.
- **Phase 2 - AI differentiators (stretch)**: auto-detect fields on upload (Claude vision), plain-language summary for patients, optional AI chat on document. Only start after Phase 1 demo flows perfectly.

## User personas

1. **Provider** (doctor, clinic admin): signs in with Google via Clerk, creates and sends documents, tracks signing status. Full authenticated access.
2. **Patient** (document recipient): receives email with magic link, signs in browser without account creation. No login, time-limited tokenized access only.

## Core user flows

### Flow 1: Provider signup and login (Clerk-handled)

- Landing page has "Sign in with Google" via Clerk prebuilt components
- First login creates User + Organization in our DB via Clerk webhook (user.created event)
- Subsequent logins find the User by Clerk userId and load clinic context
- Session managed by Clerk (no JWT work on our side)
- Logout clears Clerk session

### Flow 2: Create and send document

- Provider clicks "New Document" on dashboard
- Uploads a PDF (max 10MB)
- PDF renders in editor. Provider drags signature, text, date, checkbox, initial fields onto the PDF
- Each field has x, y, width, height, page number, required flag
- Provider adds recipient: name + email
- Clicks "Send". Backend generates signed JWT magic link, sends email to patient.
- Document status moves from DRAFT to SENT
- Provider returns to dashboard which shows the document with "Sent" badge

### Flow 3: Patient signs

- Patient receives email with "Review and sign" button
- Click opens /sign/:token in browser
- Token validated (not expired, not already signed, not voided)
- PDF renders with fields highlighted
- "Get started" button walks patient through each field
- For signature fields, modal opens with two options: type name (renders in cursive font) or draw on canvas
- Patient submits, backend:
  - Validates all required fields filled
  - Fetches original PDF from S3
  - Overlays field values onto PDF using pdf-lib
  - Stores signed PDF in S3 with different key
  - Creates AuditLog entry with IP, user agent, timestamp
  - Updates Document status to SIGNED
  - Sends completion email to both provider and patient with download link
- Patient sees thank-you page with download link

### Flow 4: Provider reviews signed document

- Dashboard shows document with "Signed" badge
- Click opens document detail page
- Shows: original PDF, signed PDF download, full audit trail, recipient info
- Provider can download signed PDF

### Flow 5: Edge cases
- Expired tokens (after 7 days) move document to EXPIRED status
- Provider can resend (new token generated)
- Provider can void a document (status VOIDED, tokens invalidated)

## Phase 2 flows (AI, build only after Phase 1 is solid)

### Flow A: Auto-detect fields on upload

- After PDF upload, a button "Auto-detect fields" appears in the editor
- Clicking it sends PDF pages (as images) to Claude Sonnet vision
- Claude returns a structured JSON: array of detected field suggestions with type, page, x, y, width, height
- Suggestions appear as semi-transparent overlays on the PDF
- Provider accepts/rejects each, or "Accept all"
- Streams results so the UI feels responsive

### Flow B: Plain-language summary for patients

- When patient opens signing link, show a "What am I signing?" card at the top
- Backend has pre-generated a plain-English summary when the document was sent
- Summary is stored alongside the document; generated once
- 2-3 sentences explaining what the form does in lay terms

### Flow C: Optional stretch - AI chat on document

- Patient sees "Ask a question about this form" button on signing page
- Opens a chat panel
- Questions answered with PDF text as context (RAG pattern, but for a single doc so no vector DB needed)
- Claude streams the answer

## Out of scope (explicit)

These will be called out in README as future work:
- Building documents from scratch (upload PDF only)
- Multiple recipients with signing order
- Document templates library
- Payment collection
- CRM integrations
- Real-time collaboration / comments
- SMS delivery
- Custom branding per clinic
- Multi-clinic enterprise features

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Repo | Turborepo monorepo | Shared types, one-command setup |
| Frontend | Next.js 16 App Router + TypeScript | Modern, typed, fast |
| UI | Tailwind + shadcn/ui | Professional look, accessible |
| Forms | React Hook Form + Zod | Type-safe validation |
| Server state | TanStack Query | Caching, loading states |
| PDF rendering | react-pdf | Standard library |
| Canvas signature | signature_pad | Lightweight, mobile-friendly |
| Backend | Node.js + Express + TypeScript | Straightforward, flexible |
| Auth | Clerk (provider) + signed tokens (patient) | Free tier covers everything we need; saves hours of auth work |
| Validation | Zod | Same library both sides for symmetry |
| Database | PostgreSQL | Relational, ACID, proven |
| ORM | Prisma | Type-safe, migrations, great DX |
| PDF manipulation | pdf-lib | Pure JS, runs in Node |
| File storage | AWS S3 | HIPAA-eligible, scalable |
| Email | Resend (dev) / AWS SES (prod) | Resend has nicer DX, SES has HIPAA story |
| Logging | Pino | Structured JSON logs |
| Testing | Vitest | Fast, modern |
| AWS persistence | RDS (PostgreSQL) + S3 | Provisioned via Pulumi (`infra/`) |
| AI (Phase 2) | Anthropic Claude Sonnet 4.6 | Vision for field detection, chat for RAG |
| Deployment | Vercel (`apps/web`) + AWS (ECR → ECS Fargate + ALB for `apps/api`) + RDS + S3 | See `infra/README.md` |

## Database schema

```prisma
model User {
  id              String        @id @default(uuid())
  clerkUserId     String        @unique
  email           String        @unique
  name            String
  organizationId  String
  organization    Organization  @relation(fields: [organizationId], references: [id])
  documents       Document[]
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([clerkUserId])
}

model Organization {
  id        String     @id @default(uuid())
  name      String
  users     User[]
  documents Document[]
  createdAt DateTime   @default(now())
}

model Document {
  id                String    @id @default(uuid())
  title             String
  organizationId    String
  organization      Organization @relation(fields: [organizationId], references: [id])
  createdByUserId   String
  createdBy         User      @relation(fields: [createdByUserId], references: [id])
  originalPdfKey    String
  signedPdfKey      String?
  status            DocumentStatus @default(DRAFT)
  expiresAt        DateTime?
  sentAt            DateTime?
  signedAt          DateTime?
  voidedAt          DateTime?
  plainSummary      String?   // Phase 2: AI-generated summary
  fields            DocumentField[]
  recipients        DocumentRecipient[]
  auditLogs         AuditLog[]
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([organizationId, status])
  @@index([createdByUserId])
}

enum DocumentStatus {
  DRAFT
  SENT
  VIEWED
  SIGNED
  EXPIRED
  VOIDED
}

model DocumentField {
  id          String   @id @default(uuid())
  documentId  String
  document    Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  type        FieldType
  page        Int
  x           Float
  y           Float
  width       Float
  height      Float
  required    Boolean  @default(true)
  value       String?
  recipientId String?
  recipient   DocumentRecipient? @relation(fields: [recipientId], references: [id])
  aiGenerated Boolean  @default(false) // Phase 2: track AI-suggested fields

  @@index([documentId])
}

enum FieldType {
  SIGNATURE
  TEXT
  DATE
  CHECKBOX
  INITIAL
}

model DocumentRecipient {
  id                  String   @id @default(uuid())
  documentId          String
  document            Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  name                String
  email               String
  tokenHash           String   @unique
  tokenExpiresAt      DateTime
  signedAt            DateTime?
  signedFromIp        String?
  signedUserAgent     String?
  signatureImageKey   String?
  fields              DocumentField[]
  createdAt           DateTime @default(now())

  @@index([documentId])
}

model AuditLog {
  id         String   @id @default(uuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  actorType  ActorType
  actorId    String?
  eventType  EventType
  metadata   Json
  timestamp  DateTime @default(now())

  @@index([documentId, timestamp])
}

enum ActorType {
  PROVIDER
  RECIPIENT
  SYSTEM
}

enum EventType {
  DOCUMENT_CREATED
  DOCUMENT_SENT
  DOCUMENT_VIEWED
  DOCUMENT_FIELD_FILLED
  DOCUMENT_SIGNED
  DOCUMENT_EXPIRED
  DOCUMENT_VOIDED
  DOCUMENT_RESENT
  DOCUMENT_DOWNLOADED
  AI_FIELDS_DETECTED
  AI_SUMMARY_GENERATED
}
```

## API contract

All endpoints return JSON. All mutations return updated resource. All errors follow shape:

```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Document with id xxx not found"
  }
}
```

### Auth (Clerk-handled, minimal custom endpoints)

- Clerk handles signin, signup, session management, JWT issuance automatically
- Our backend verifies Clerk JWTs via `@clerk/express` middleware
- `POST /api/webhooks/clerk` - receives Clerk webhooks (user.created, user.deleted) to sync our DB

### Documents (Clerk auth required)

- `GET /api/documents` - query: ?status, ?page, ?limit - returns paginated list
- `POST /api/documents` - multipart: pdf file + title - returns draft document
- `GET /api/documents/:id` - returns document with fields, recipients, audit log
- `PATCH /api/documents/:id` - body: partial update (title, fields[]) - returns updated
- `DELETE /api/documents/:id` - soft delete (status VOIDED)
- `POST /api/documents/:id/send` - body: { recipientName, recipientEmail } - generates token, sends email, returns updated document
- `POST /api/documents/:id/resend` - regenerates token, sends email again
- `GET /api/documents/:id/download?type=original|signed` - returns presigned S3 URL

### Signing (no auth, token-based)

- `GET /api/sign/:token` - returns { document, fields, summary? } for recipient to fill
- `POST /api/sign/:token/complete` - body: { fieldValues: [{fieldId, value}] } - finalizes signing

### Audit (Clerk auth required)

- `GET /api/documents/:id/audit` - returns audit log entries

### AI endpoints (Phase 2 only - skip if out of time)

- `POST /api/documents/:id/ai/detect-fields` - kicks off AI field detection, returns detected fields (streaming response)
- `POST /api/documents/:id/ai/summarize` - generates plain-language summary, stores on document
- `POST /api/sign/:token/ai/chat` - (stretch) ask a question about the document, streams response

## Folder structure

```
clinicsign/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (public)/
│   │   │   │   ├── page.tsx (landing)
│   │   │   │   ├── sign-in/[[...sign-in]]/page.tsx (Clerk)
│   │   │   │   └── sign-up/[[...sign-up]]/page.tsx (Clerk)
│   │   │   ├── (dashboard)/
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── documents/
│   │   │   │   │   ├── new/page.tsx
│   │   │   │   │   └── [id]/page.tsx
│   │   │   ├── sign/[token]/page.tsx
│   │   │   ├── layout.tsx (wraps with ClerkProvider)
│   │   │   └── proxy.ts (Clerk `clerkMiddleware` for protected routes; Next.js 16 convention)
│   │   ├── components/
│   │   │   ├── ui/ (shadcn)
│   │   │   ├── document-editor/
│   │   │   ├── signing-flow/
│   │   │   └── dashboard/
│   │   ├── lib/
│   │   │   ├── api-client.ts
│   │   │   └── utils.ts
│   │   └── package.json
│   └── api/
│       ├── src/
│       │   ├── config/
│       │   │   ├── env.ts (zod-validated env)
│       │   │   └── logger.ts (pino setup)
│       │   ├── middleware/
│       │   │   ├── clerk-auth.ts (wraps @clerk/express)
│       │   │   ├── error-handler.ts
│       │   │   ├── rate-limit.ts
│       │   │   └── request-id.ts
│       │   ├── routes/
│       │   │   ├── documents.routes.ts
│       │   │   ├── signing.routes.ts
│       │   │   ├── webhooks.routes.ts (clerk webhooks)
│       │   │   └── ai.routes.ts (Phase 2)
│       │   ├── controllers/
│       │   ├── services/
│       │   │   ├── documents.service.ts
│       │   │   ├── signing.service.ts
│       │   │   ├── pdf.service.ts
│       │   │   ├── s3.service.ts
│       │   │   ├── email.service.ts
│       │   │   ├── audit.service.ts
│       │   │   ├── user-sync.service.ts (Clerk -> DB sync)
│       │   │   └── ai.service.ts (Phase 2)
│       │   ├── repositories/
│       │   ├── schemas/
│       │   ├── types/
│       │   ├── utils/
│       │   ├── app.ts
│       │   └── server.ts
│       ├── prisma/
│       ├── tests/
│       └── package.json
├── packages/
│   ├── shared-types/
│   └── config/
├── infra/                     Pulumi: VPC, RDS, S3, KMS, IAM, ECR (see infra/README.md)
├── docker-compose.yml         Optional: API container only; DB is AWS RDS
├── turbo.json
├── package.json
└── README.md
```

## Coding standards (non-negotiable)

- TypeScript strict mode everywhere, no `any`
- Zod schema at every API boundary (request body, query params, env vars)
- No hardcoded secrets, everything in .env (committed .env.example with placeholders)
- Every API endpoint wrapped in try-catch with typed errors
- Structured logs (pino) with correlation IDs, never console.log in production code
- Repository pattern: Prisma calls only live in `repositories/`
- Service layer for business logic, controllers just orchestrate
- Components under 200 lines, split when larger
- No business logic in React components, move to hooks or services
- Commit messages follow conventional commits (feat:, fix:, chore:, docs:, test:)
- README must explain setup in 3 commands or less for the reviewer

## Clerk integration notes

- Use `@clerk/nextjs` in apps/web for frontend
- Use `@clerk/express` in apps/api for backend (verifies Clerk JWT on each request)
- Set up a webhook endpoint that receives `user.created` from Clerk to create a User + Organization in our DB
- The Clerk user ID is stored on our User row as `clerkUserId` - this is our join key
- For this MVP: each new Clerk user gets their own Organization automatically (name defaults to user's name + "'s workspace", editable in settings later)
- Proxy at `apps/web/proxy.ts` (Next.js 16 naming; Clerk `clerkMiddleware`) protects dashboard routes
- Public routes: landing, sign-in, sign-up, /sign/:token
- Clerk provides `<SignIn />`, `<SignUp />`, `<UserButton />` components - use them, don't build custom

### Why Clerk here

Writing this in the README for reviewer context:

> Clerk was chosen for authentication to focus engineering time on the core signing workflow, which is the novel part of this take-home. For a production HIPAA-compliant deployment, we would either (a) upgrade to Clerk's HIPAA BAA tier, or (b) migrate to a self-hosted auth stack (Auth.js + our own BAA partners). The `clerkUserId` field on User provides a clean seam for that migration.

## Design direction

Medical, clean, calm. Think One Medical, Forward, Oscar Health. Not PandaDoc green (too corporate-sales). Not hospital fluorescent. A warm, soft, trustworthy feel.

- **Primary**: soft sage/teal (#5A9B8E or similar)
- **Accent**: warm neutral
- **Background**: warm off-white (#FAFAF7 or similar), not pure white
- **Text**: near-black (#1A1A1A), high contrast
- **Font**: Inter or Geist Sans, larger base size than typical SaaS (16-17px base)
- **Spacing**: generous, 8pt grid
- **Corners**: medium rounded (8-12px), not sharp, not overly rounded

Patient-facing pages especially should have large tap targets, large fonts, and clear one-primary-action-per-screen flow. Older users might use this.

## HIPAA architecture notes (for README)

The app is not HIPAA-certified because that requires a BAA with AWS and Clerk, a SOC 2 audit, employee training, and formal breach procedures, none of which fit in a 2-day timeline. However, the architecture is designed to be HIPAA-compliant once those organizational steps are in place.

Technical controls implemented:
- All AWS services used (S3, SES, RDS, ECS, CloudWatch) are HIPAA-eligible
- Clerk is HIPAA-compatible on their Enterprise BAA tier
- PHI encrypted at rest via S3 server-side encryption with KMS
- PHI encrypted in transit via TLS 1.2+
- Magic link tokens are signed JWTs with short expiry and single-use enforcement
- Audit log is append-only (no update or delete operations)
- Database credentials and JWT secrets in env vars, never in code
- Least-privilege IAM roles for each service
- Rate limiting on auth and signing endpoints

Controls that would need to be added for full compliance:
- BAA with AWS and Clerk (or migration to self-hosted auth)
- Annual SOC 2 audit
- Intrusion detection and centralized security monitoring
- Automated PHI access reports
- Formal breach notification procedures
- Employee HIPAA training documentation
