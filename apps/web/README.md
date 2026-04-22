# `apps/web` — ClinicSign frontend

Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, Clerk, react-pdf.

Two audiences in one app: the clinician who creates the document and the patient who signs it. Both flows run in the same codebase and share the same design tokens.

---

## At a glance

| | |
|---|---|
| Framework | **Next.js 16.2** App Router (`--webpack`; Turbopack not yet wired for `pdf.js`) |
| React | **19.2** |
| TypeScript | **5.7**, strict mode, no `any` |
| Styling | **Tailwind CSS v4** + `@tailwindcss/postcss` + **tw-animate-css** |
| Components | **shadcn/ui** (base-nova) over **Radix UI** primitives |
| Auth | **`@clerk/nextjs`** 6 (provider auth) + magic-link tokens (patient) |
| Forms | **React Hook Form** + **Zod** (same schemas the API uses) |
| Server state | **TanStack Query** 5 |
| PDF render | **`react-pdf` 10** (wraps `pdf.js`) |
| Signature | **`signature_pad` 5** — ~5 KB, DPR-aware |
| Icons | **`lucide-react`** |
| Toasts | **`sonner`** |
| Deploy | **Vercel**, root directory `apps/web` |

---

## Quick start

```bash
cp .env.example .env.local          # from apps/web/, fill Clerk + API URL
npm install                         # from monorepo root (Turborepo)
npm run dev                         # → http://localhost:3000
```

`.env.local` must contain:

```env
NEXT_PUBLIC_API_URL=https://<your-api-host>     # no trailing slash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

Production build: `npm run build && npm start`.

---

## Directory map

```
apps/web/
├── app/
│   ├── (public)/                  unauth routes
│   │   ├── page.tsx               landing
│   │   ├── sign-in/[[...]]        Clerk
│   │   └── sign-up/[[...]]        Clerk
│   ├── (dashboard)/               Clerk-protected
│   │   ├── layout.tsx             shell + nav
│   │   └── dashboard/
│   │       ├── page.tsx           documents grid (KPIs, filters, pagination)
│   │       └── documents/
│   │           ├── new/           upload + editor entry
│   │           └── [id]/          detail (preview + activity)
│   ├── sign/[token]/              patient signing route (public, token-guarded)
│   ├── globals.css                Tailwind v4 + design tokens
│   ├── layout.tsx                 ClerkProvider, theming, fonts
│   └── proxy.ts                   Clerk middleware (Next 16 naming)
├── components/
│   ├── ui/                        shadcn primitives
│   ├── dashboard/                 clinician-facing features
│   │   ├── dashboard-shell.tsx
│   │   ├── documents-command-center.tsx
│   │   ├── document-pdf-editor.tsx    field placement + grid snap + alignment
│   │   ├── document-detail-view.tsx   PDF-first two-column layout
│   │   ├── document-activity-timeline.tsx
│   │   └── pdf-dropzone.tsx
│   └── signing/                   patient-facing (one file, intentionally)
│       └── patient-signing-client.tsx
├── lib/
│   ├── api-client.ts              fetch wrappers + ApiError class
│   ├── api-types.ts               shared response shapes
│   ├── pdf-worker.ts              lazy configuration of pdfjs worker
│   └── utils.ts                   cn(), misc
├── DESIGN_SYSTEM.md               color/type/spacing tokens
└── next.config.ts                 standalone output, pdf.js alias hack
```

---

## Two audiences, one app

### Clinician side (authenticated, `/(dashboard)`)

- Dashboard with KPIs + sparklines + week-over-week delta, smart-chip filters, attention banner for stale docs, client-side pagination (10/page, prefetch 100), recipient column, void-from-grid (HIPAA-compliant: sets status to `VOIDED`, preserves audit trail)
- Upload flow: stepper, in-place PDF preview with page count + file size, zero-state template chip row
- Editor: drag-drop fields onto any page, grid snap + sibling alignment guides (always on), `Delete` removes the selected field, required/optional toggle in the side panel
- Document detail: two-column layout (PDF left, consolidated status + actions + recipient + fields breakdown right), tabs switch between *Preview* and *Activity* (audit log with absolute local timestamps including timezone)
- Sidebar, sticky header, `⌘K` scaffolding (cmdk installed)

### Patient side (unauthenticated, `/sign/:token`)

No account, no password, no app.

- Token validated server-side before render; distinct copy for *expired / invalidated / already-signed* (the last is non-destructive and shows the signed PDF)
- PDF renders full width on mobile and desktop. The `pageWidth` is measured via a callback ref + `ResizeObserver` so the host element is definitely attached at measurement time.
- Field overlays are percentage-positioned relative to the PDF canvas; the one-frame drift between CSS width and canvas width is pinned via `style={{ width: pageWidth }}`
- **Progress bar** above the PDF: `X of Y complete`, live
- **"Sign here" pulsing pill** on the next unfilled required field (rendered as a sibling to the button because the button has `overflow-hidden` to clip long TEXT values — children would be clipped)
- **Auto-scroll** to the next unfilled field after saving; on submit-click with anything unfilled, scroll-to-first-missing
- **Submit disabled** until all required fields are filled; helper text explains why
- Sticky bottom submit bar on mobile with progress + "Next" jump link; `env(safe-area-inset-bottom)` respected so iPhone home-indicator doesn't clip
- Signature modal: draw (DPR-aware canvas) or type; auto-remount on dialog open so coordinate math doesn't collapse to `(0,0)`
- Hit targets ≥ 44px *except* on field overlays (they're explicitly excluded from the `min-height: 44px` rule in `globals.css` so small fields don't bleed over each other)

---

## Implementation notes

A handful of things in this app are non-obvious from the outside:

1. **PDF width measurement via callback ref, not `useLayoutEffect`.** The measurement host mounts *after* the `useQuery` resolves. A `useLayoutEffect` with empty deps runs once at mount, finds the host still `null`, returns early, and never re-runs. Callback refs fire on attach/detach regardless of when in the lifecycle that happens. React 19 supports returning a cleanup function from a callback ref — we use it to disconnect the `ResizeObserver`. See `setPageHost` in the signing client.

2. **Field overlay `min-height` exclusion.** Our global `[data-audience="patient"] button` rule forces `min-height: 44px` for accessibility. Without an exclusion, every field overlay was being stretched to 44px regardless of its stored percentage height, bleeding fields into each other on mobile. Solution: `[data-field-overlay]` is opted out of the rule.

3. **Pill-above-field placement.** The "Sign here" pulsing pill can't be a child of the overlay button (overflow-hidden clips it). It's a sibling `<span>` in the same absolute coordinate space as the button, positioned via `calc(${field.y * 100}% - 1.5rem)` / `translateX(-50%)`.

4. **Grid snap + sibling alignment.** Grid-only snapping misaligns fields that are placed a few pixels apart (they snap to adjacent grid cells). We stack alignment guides on top: if the field's top or left is within ~1.2% of a sibling field's top or left, we snap to the sibling's edge. Both are always on — no modifier key needed.

5. **Absolute local timestamps in the audit timeline.** `formatAbsoluteLocal` uses `Intl.DateTimeFormat` with `timeZoneName: "short"` to render `"Apr 22, 2026, 1:30:29 AM PDT"`. The `title` attribute holds the ISO string for copy-paste.

---

## Design system

Tokens live in **[`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)** and in `app/globals.css` as CSS variables bridged into Tailwind via `@theme`. Short version:

- **Sage / teal** primary (the product is medical-calm, not PandaDoc-corporate-green)
- **Warm off-white** background
- **8pt spacing scale**, medium rounded corners (8–12px)
- Typography: Geist Sans body, base 16px; `text-h1` / `text-h2` / `text-body-lg` / `text-caption` as semantic classes, not ad-hoc sizes
- Everything routes through `cn()` + `tailwind-merge` — no raw class concatenation

There's a `data-audience="clinician" | "patient"` attribute on each `<main>` so we can diverge rules when it's warranted (larger tap targets for patients, bigger type for older users).

---

## Commands

| `npm run …` | Does |
|---|---|
| `dev` | `next dev -p 3000 --webpack` |
| `dev:clean` | `rm -rf .next && next dev` — for when the HMR cache gets weird |
| `build` | `next build --webpack` |
| `start` | `next start -p 3000` |
| `lint` | `eslint .` |
| `typecheck` | `tsc --noEmit` |

---

## Deploying to Vercel

1. **Root directory**: `apps/web` (it's a monorepo).
2. **Build command**: default.
3. **Env vars**: `NEXT_PUBLIC_API_URL` (the CloudFront HTTPS URL from Pulumi), Clerk publishable + secret keys, Clerk sign-in/up URLs.
4. Add the Vercel URL to Clerk's allowed origins.
5. Add the Vercel URL to the API's CORS allowlist (`apps/api/src/app.ts`, `cors({ origin: [...] })`).

Rebuild after any Clerk dashboard change — publishable keys are baked into the client bundle.

---

## Accessibility notes we don't want to regress

- Every interactive has a visible focus ring (`:focus-visible` in `globals.css`)
- Dialogs trap focus (Radix default, don't remove)
- Every patient-facing button has an `aria-label`; field overlays use `aria-label={filled ? "... — change" : "Add ..."}`
- Progress strip uses `role="status" aria-live="polite"` — screen readers get the update when a field completes
- `prefers-reduced-motion`: the "Sign here" pill still animates (tailwind's `animate-pulse` animates opacity, which is mild). If we ever replace it with a bouncing transform, wrap in a media query.
- `Intl.DateTimeFormat` uses the user's locale automatically. Don't hardcode `en-US`.

---

## What this app does *not* do (yet)

- PDF templates (clinic-level reusable forms) — backend-heavy, deferred
- Email templates via `@react-email/components` — deferred
- Image → PDF via vision LLM — designed, deferred
- Multi-recipient signing order (one recipient per document today)
- `beforeunload` warning for unsaved field edits — on the backlog
- Drafts persisted to `localStorage` — on the backlog

See [`PROJECT.md`](../../PROJECT.md) for the full out-of-scope list.

---

## When to touch what

| Change | File(s) |
|---|---|
| New status filter chip | `documents-command-center.tsx` |
| New audit event icon | `document-activity-timeline.tsx` (+ backend for the event type) |
| Change a design token | `app/globals.css`, then `DESIGN_SYSTEM.md` to document it |
| New field type | `document-pdf-editor.tsx` + `patient-signing-client.tsx` + API `FieldType` enum + `pdf-field-renderer.ts` (backend) |
| New patient-side guardrail | `patient-signing-client.tsx` — it's one file on purpose |
