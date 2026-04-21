# UI, Next.js, and design reference

This document describes the **actual implementation** in this repo and how it relates to **`DESIGN_DOC.md`**. Use it to replicate the engineering approach in another project.

---

## 1. Versions (`package.json`)

| Piece | Version / choice |
|--------|-------------------|
| **Next.js** | **16.2.4** (App Router) |
| **React** | **19.2.x** (`react` + `react-dom`; root `overrides` may pin patch) |
| **TypeScript** | **^5**, **`strict: true`** (`tsconfig.json`) |
| **Tailwind CSS** | **v4** (`tailwindcss`, `@tailwindcss/postcss`) |
| **ESLint** | **v9** with **`eslint-config-next` 16.2.4** (`eslint.config.mjs`, flat config) |
| **shadcn** | **`shadcn` ^4.3.0** |
| **Animation** | **`tw-animate-css` ^1.4.0** (imported in `app/globals.css`) |
| **OpenAI SDK** | **`openai` ^6.34.0** (chat API route) |

**Not in `package.json` today** (but mentioned in `DESIGN_DOC.md` Section 5): Framer Motion, GSAP / ScrollTrigger, Zustand, `lucide-react` as a direct dependency. Icons in the Hero are mostly inline SVG. Replicate either the doc (add those deps) or the repo (canvas + CSS + observers).

---

## 2. Next.js engineering

### App Router

- `app/page.tsx`: Server Component; renders `<Studio />` only.
- `app/layout.tsx`: `metadata`, `viewport` (`themeColor: "#0A0D12"`, `colorScheme: "dark"`), fonts, `globals.css`, wraps children in **`AskAgentProvider`**.

### Config

- **`next.config.ts`**: `output: "standalone"` (Docker); rewrite `/favicon.ico` → `/icon`; **`webpack`** `resolve.alias.canvas = false` for pdf.js (dev/build scripts use **`next dev` / `next build --webpack`** until Turbopack gets equivalent aliases).
- **`proxy.ts`** (root of `apps/web`): Clerk auth gate (replaces deprecated `middleware.ts` in Next.js 16).
- **`package.json` `start`**: `node .next/standalone/server.js`.

### TypeScript

- Path alias: **`@/*`** → repository root.

### OG / icons

- `app/opengraph-image.tsx`: Edge OG image via `next/og` `ImageResponse`.
- `app/icon.tsx`: dynamic 32×32 favicon.

---

## 3. Styling: two token layers

### Layer A: `app/globals.css` (Tailwind v4 + shadcn bridge)

- Imports: `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`.
- `@custom-variant dark (&:is(.dark *));`
- `@theme inline { ... }`: maps shadcn semantic colors to CSS variables; registers `--font-sans`, `--font-mono`, `--font-display`; motion tokens `--ease-scene`, `--duration-scene`, `--duration-hover`; radius scale.

**`:root`** (blue palette aligned with `DESIGN_DOC.md` / `.cursor/rules/frontend-design.mdc`):

- Backgrounds: `--bg-deep`, `--bg-elevated`, `--bg-raised`
- Text: `--ink-primary`, `--ink-secondary`, `--ink-muted`
- Accents: `--accent-primary`, `--accent-warm`, `--accent-teal`, `--accent-amber`
- Borders, `--glow-agent`
- Spacing: `--space-*` (4px scale), section vars `--section-pad-*`, `--content-max`, `--prose-max`
- Line height: `--lh-display`, `--lh-body`

**Base layer**

- `color-scheme: dark`, selection and `:focus-visible` using accent colors.
- `prefers-reduced-motion: reduce`: short animation/transition durations, `scroll-behavior: auto` for transitions.

### Layer B: `components/studio/palettes.ts` (`--ov-*`)

**`Studio`** applies `paletteVars("mono")` as inline `style` on `<main>`:

- Graphite / bone: `--ov-ink`, `--ov-bone`, muted steps, accents `--ov-brass`, `--ov-coral`, `--ov-teal`, `--ov-sage`, rules `--ov-rule`, `--ov-rule-strong`.

**Visible long-scroll UI** is mostly **`var(--ov-*)`** and **`--section-accent`**, not the blue `:root` marketing tokens. Tailwind/shadcn defaults still point at the `:root` / `@theme` mapping.

**For another project:** choose one system or keep dual layers (global theme + per-root overlay).

---

## 4. Typography

**Fonts** (`app/layout.tsx`, `next/font/google`):

- Geist → `--font-geist-sans`
- Geist Mono → `--font-geist-mono`
- Instrument Serif (400) → `--font-instrument-serif`

**`globals.css`** assigns `--font-sans`, `--font-mono`, `--font-display` for Tailwind.

**Patterns**

- Display: Instrument Serif, tight tracking (`-0.02em`), large `clamp` on landing.
- Body: Geist; mono for labels / tickers / uppercase microcopy.
- Prose: `max-w-[68ch]` where noted (e.g. assistant bubble).
- Wide letterspacing on small caps labels (`tracking-[0.28em]`–`[0.32em]`).

---

## 5. Page structure (`components/studio/Studio.tsx`)

Single `<main>`:

1. `BackgroundLayer` (`neural` → fixed canvas).
2. `TopTicker` (sticky nav + scroll spy).
3. `SectionSkin` sequence: `accent` in `{ brass, teal, coral, sage }`, `backdrop` (currently all `plain`; richer backdrops exist in `SectionSkin.tsx`).
4. Sections: `Landing` → `Hero` (`#ask`) → `WhoIs` → `Skills` → `Timeline` → `Scene` → `Projects` → `Marginalia` → `Build` → `Contact`.
5. `BottomTicker`, `PortfolioJourneyButton`.

**`SectionSkin`:** sets `--section-accent`; optional `BACKDROPS` use `color-mix(in srgb, var(--ov-*) …)`.

**`TopTicker`:** `NAV` ids, smooth `scrollIntoView`, rAF-throttled scroll spy with ~120px offset.

---

## 6. Backgrounds and motion (implementation)

### Neural canvas (`components/studio/parts/CanvasBackgrounds.tsx`)

- Fixed, full viewport, `z-index: 0`, `opacity: 0.65`, `pointer-events: none`.
- ~72 nodes, distance-based links, bounce motion; reads `--ov-bone`; `MutationObserver` on `<main style>`.
- `prefers-reduced-motion`: no physics updates.
- `visibilitychange`: pauses animation when tab hidden.

### Solar system (`components/studio/parts/SolarSystem.tsx`)

- Canvas inside `Landing`; stars, orbits, planets; uses `--ov-ink`.

### Landing reveal (`components/studio/parts/Landing.tsx`)

- `IntersectionObserver` (`threshold: 0.15`); fade + translate with `cubic-bezier(0.22, 1, 0.36, 1)`, ~900ms.

### Portfolio journey (`components/studio/parts/PortfolioJourneyButton.tsx`)

- Scroll to anchors, wait `SCROLL_SETTLE_MS` (950), `runAsk`, TTS via `createVoiceProvider()`.
- Reduced motion: `instant` vs `smooth` scroll.

No Framer Motion / GSAP in dependencies today; `DESIGN_DOC.md` describes pinned CCTA-style sections as product intent.

---

## 7. Agent / chat UI

### Context (`components/studio/AskAgentContext.tsx`)

- `registerAskHandler`: Hero registers the streaming `/api/chat` handler.
- `runAsk`: used by `PortfolioJourneyButton` and others.

### Hero (`components/studio/parts/Hero.tsx`, `id="ask"`)

- Transcript: `aria-live`, streaming UI, scoped keyframes + reduced-motion overrides.
- Composer: Enter send, Shift+Enter newline, mic (if supported), read aloud, stop, Auto-read.
- Voice: `createVoiceProvider()` from `components/agent/voice/factory`.
- First-visit tour: `localStorage` key `ov:ask-tour:v1`.

### API (`app/api/chat/route.ts`)

- `maxDuration = 60`.
- `runAgenticChat`, guardrails, OpenAI-compatible client (OpenRouter / OpenAI per env).

### Voice (`components/agent/voice/`)

- `VoiceProvider` interface, `WebSpeechProvider`, `NoopProvider`, `factory.ts`. Same engineering idea as `DESIGN_DOC.md` Section 7.6.

---

## 8. shadcn (`components.json`)

- Style: `base-nova`, `rsc: true`, `tsx: true`.
- Tailwind: `css: app/globals.css`, `cssVariables: true`, `baseColor: neutral`.
- Icons: lucide (configured); Hero uses inline SVGs heavily.
- Aliases: `components`, `utils`, `ui`, `lib`, `hooks`.

**Note:** `components/ui` may be empty or absent; theme comes from `shadcn/tailwind.css` + `@theme`.

---

## 9. Content source (`lib/profile.ts`)

Structured copy and metadata shared by UI and server context: hiring, `WHO_LINES`, URLs, `BUILD_COMMIT`, `BUILD_DATE`, etc.

---

## 10. Cursor / design rules (`.cursor/rules/frontend-design.mdc`)

- Editorial, premium; avoid generic “AI slop” UI.
- Before new UI: state aesthetic, spacing rhythm, motion.
- Motion: `cubic-bezier(0.22, 1, 0.36, 1)`, hover 180ms, entrances 400–600ms, stagger 60ms; respect `prefers-reduced-motion`.
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192 (px).
- Typography: display Instrument 400 `-0.02em`; body Geist; mono Geist Mono; 68ch prose; lh 1.1 / 1.55.
- Colors: doc points at `globals.css` blue tokens; Studio uses `--ov-*` for the shipped graphite look.

---

## 11. `DESIGN_DOC.md` vs this repo

| `DESIGN_DOC.md` | This repo |
|-----------------|-----------|
| Blue midnight palette as primary story | Blue tokens in `:root`; **Studio** uses **graphite/bone `--ov-*`** on `<main>` |
| Framer Motion + GSAP ScrollTrigger | Not in `package.json`; canvas + CSS + observers |
| Full agent tour, RAG, tool SSE spec | Simplified: `/api/chat`, `Hero`, journey button, voice providers |
| Directory `components/sections/`, `components/agent/*` | **`components/studio/parts/`**, agent voice under `components/agent/voice/` |

Treat **`DESIGN_DOC.md`** as product and architecture spec; treat **`Studio` + `globals.css` + `palettes.ts`** as the **concrete UI** to clone.

---

## 12. Replication checklist (another project)

1. Next 16 App Router, React 19, TS strict, Tailwind 4 + PostCSS, ESLint 9 flat; optional `standalone` output.
2. `globals.css`: `@import` tailwind, theme tokens, base layer, reduced motion.
3. Fonts via `next/font` + CSS variables wired into `@theme`.
4. Thin `app/page.tsx`; client shell; `parts/` sections; sticky chrome + fixed background.
5. Canvas loops: pause on hidden tab; respect `prefers-reduced-motion`.
6. A11y: live regions, focus rings, control labels.
7. Optional: ask flow with provider-registered handler + route handler + `VoiceProvider` abstraction.
8. Central copy module (e.g. `lib/profile.ts`).

---

*Generated as a portable reference for this codebase. Update if versions or structure change.*
