# ClinicSign Design System

This document is the single source of truth for every visual and interaction decision. Before writing any UI, Cursor reads this. When in doubt, this file wins.

## Design philosophy

ClinicSign is a tool patients use on some of the most anxious days of their lives and providers use between appointments under time pressure. The design must feel:

- **Calm**: no bright reds, no pulsing animations, no urgency cues. The opposite of an ad.
- **Trustworthy**: consistent, predictable, no surprises. Every button looks like a button.
- **Human**: warm off-whites not sterile pure white. Medium radius corners not sharp. Generous spacing.
- **Confident**: strong typography hierarchy, clear primary action on every screen.
- **Accessible**: WCAG AA minimum. Assume older users, lower-vision users, slow-connection users.

Think One Medical, Forward, Oscar Health. NOT PandaDoc corporate sales green. NOT hospital fluorescent. NOT Silicon Valley purple-gradient AI startup.

## Color system (OKLCH, Tailwind v4 syntax)

All colors live as CSS variables in `globals.css`. Never hardcode hex colors in components. Always use the semantic token via Tailwind utilities like `bg-primary`, `text-foreground`, `border-border`.

### Light mode (default)

| Token | Value | Usage |
|---|---|---|
| `--background` | `oklch(0.99 0.005 95)` | Warm off-white page background |
| `--foreground` | `oklch(0.15 0.01 250)` | Primary text |
| `--card` | `oklch(1 0 0)` | Card surfaces, elevates from background |
| `--card-foreground` | `oklch(0.15 0.01 250)` | Text on cards |
| `--popover` | `oklch(1 0 0)` | Popover, dropdown, dialog |
| `--popover-foreground` | `oklch(0.15 0.01 250)` | Text on popovers |
| `--primary` | `oklch(0.55 0.08 180)` | Soft sage-teal, main brand |
| `--primary-foreground` | `oklch(0.99 0.005 95)` | Text on primary buttons |
| `--secondary` | `oklch(0.96 0.01 95)` | Secondary buttons, subtle backgrounds |
| `--secondary-foreground` | `oklch(0.25 0.02 180)` | Text on secondary |
| `--muted` | `oklch(0.95 0.008 95)` | Muted backgrounds, disabled states |
| `--muted-foreground` | `oklch(0.5 0.02 250)` | Secondary text, timestamps, helper text |
| `--accent` | `oklch(0.93 0.03 180)` | Hover states on primary elements |
| `--accent-foreground` | `oklch(0.25 0.05 180)` | Text on accent |
| `--destructive` | `oklch(0.55 0.15 28)` | Muted coral, not alarm red. Void actions, delete |
| `--destructive-foreground` | `oklch(0.99 0.005 95)` | Text on destructive |
| `--success` | `oklch(0.55 0.10 150)` | Muted green. Signed status, success states |
| `--success-foreground` | `oklch(0.99 0.005 95)` | Text on success |
| `--warning` | `oklch(0.70 0.12 75)` | Soft amber. Expiring soon, pending attention |
| `--warning-foreground` | `oklch(0.20 0.05 75)` | Text on warning |
| `--info` | `oklch(0.60 0.08 230)` | Soft blue. AI features, informational |
| `--info-foreground` | `oklch(0.99 0.005 95)` | Text on info |
| `--border` | `oklch(0.90 0.008 95)` | Borders on cards, inputs, dividers |
| `--input` | `oklch(0.90 0.008 95)` | Input border |
| `--ring` | `oklch(0.55 0.08 180)` | Focus ring, matches primary |

### Radius scale

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `6px` | Small elements, badges, chips |
| `--radius` | `10px` | Default for buttons, inputs, cards |
| `--radius-md` | `12px` | Dialogs, popovers |
| `--radius-lg` | `16px` | Large surfaces, feature cards |

Medium-soft corners. Never sharp. Never fully pill-shaped except for specific chip elements.

### Shadow scale

Shadows are subtle. No heavy drop shadows.

| Token | Value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 2px 0 oklch(0.15 0.01 250 / 0.04)` | Buttons, inputs on hover |
| `--shadow` | `0 2px 8px -2px oklch(0.15 0.01 250 / 0.06), 0 1px 3px -1px oklch(0.15 0.01 250 / 0.04)` | Cards, dropdown |
| `--shadow-md` | `0 8px 24px -6px oklch(0.15 0.01 250 / 0.10), 0 2px 6px -2px oklch(0.15 0.01 250 / 0.05)` | Modals, popovers |
| `--shadow-lg` | `0 16px 40px -12px oklch(0.15 0.01 250 / 0.14), 0 4px 12px -4px oklch(0.15 0.01 250 / 0.06)` | Elevated modals, command palette |

## Typography

Two fonts. Use `next/font` to self-host and avoid layout shift.

- **Sans (UI, body, everything default)**: Inter (variable). Fallback: system-ui, -apple-system, sans-serif
- **Serif (optional, document titles and emphasis only)**: Source Serif 4. Fallback: Georgia, serif
- **Mono (code, token display, never in UI chrome)**: JetBrains Mono. Fallback: ui-monospace, monospace
- **Signature font (ONLY for typed signature preview)**: Great Vibes (Google Fonts). Loaded only in signature modal

### Type scale

Larger than typical SaaS because patients read this, including older users.

| Token | Size | Line height | Weight | Usage |
|---|---|---|---|---|
| `text-display` | 48px / 3rem | 1.1 | 700 | Landing page hero only |
| `text-h1` | 36px / 2.25rem | 1.2 | 600 | Page titles |
| `text-h2` | 28px / 1.75rem | 1.25 | 600 | Section headers |
| `text-h3` | 22px / 1.375rem | 1.3 | 600 | Card headers |
| `text-h4` | 18px / 1.125rem | 1.35 | 600 | Subsection headers |
| `text-body-lg` | 17px / 1.0625rem | 1.6 | 400 | Patient-facing body, emphasis |
| `text-body` | 16px / 1rem | 1.55 | 400 | Default body |
| `text-body-sm` | 14px / 0.875rem | 1.5 | 400 | Helper text, table cells |
| `text-caption` | 13px / 0.8125rem | 1.4 | 500 | Labels, badges, metadata |
| `text-micro` | 11px / 0.6875rem | 1.3 | 600 | Uppercase tags, chips |

Body weight is 400 normal, 500 for medium emphasis, 600 for strong and headings, 700 for display only. Never 800 or 900, too heavy for this aesthetic.

Letter spacing: default for all sizes. Do not tighten. For `text-micro` uppercase labels, add `tracking-wide`.

### Patient-facing rule

Anywhere a patient sees the UI (landing, signing flow, thank-you page), minimum body text is 17px (`text-body-lg`). Tap targets minimum 44x44px.

## Spacing

Tailwind's default 4px grid. Prefer multiples of 8px (`gap-2`, `gap-4`, `gap-6`, `gap-8`, `gap-12`, `gap-16`) for vertical rhythm.

- Between related elements: 8-12px (`gap-2` to `gap-3`)
- Between groups within a section: 16-24px (`gap-4` to `gap-6`)
- Between sections: 32-48px (`gap-8` to `gap-12`)
- Page padding: 24px on mobile (`px-6`), 48px on desktop (`px-12`)
- Card padding: 24px (`p-6`) default, 32px (`p-8`) for feature cards

Be generous with whitespace. When in doubt, add more.

## Motion

All motion is subtle and short. Never bouncy, never flashy.

### Duration tokens

| Token | Value | Usage |
|---|---|---|
| `--duration-fast` | 150ms | Hover states, small interactions |
| `--duration` | 220ms | Default transition for most things |
| `--duration-slow` | 320ms | Page transitions, larger movements |

### Easing

- Default: `cubic-bezier(0.4, 0, 0.2, 1)` (Tailwind's `ease-in-out`)
- Enter: `cubic-bezier(0, 0, 0.2, 1)` (`ease-out`), things appearing
- Exit: `cubic-bezier(0.4, 0, 1, 1)` (`ease-in`), things leaving

### Patterns

- **Hover**: opacity or background shift, 150ms
- **Focus**: ring appears immediately (no delay), uses `--ring`
- **Button press**: very slight scale down (0.98), 100ms
- **Dialog/modal open**: fade in + slide up 8px, 220ms
- **Dialog/modal close**: fade out, 150ms (faster exit than enter)
- **Page transition**: fade between routes, 150ms
- **Skeleton shimmer**: slow pulse via opacity, 1500ms loop
- **Toast enter**: slide in from top-right, 220ms
- **Signature field highlight on patient page**: soft pulse (opacity 0.5 → 1), 2000ms loop, stops when filled

### What NOT to do

- No spring physics, no overshoots
- No transforms longer than 400ms except intentional large transitions
- No looping attention-grabbing animations (no "come sign me!" wiggles)
- No parallax
- No auto-playing video or carousels

### Framer Motion presets

Create these as constants and use them consistently.

```ts
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.22, ease: [0, 0, 0.2, 1] },
};

export const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0, 0, 0.2, 1] },
};

export const fieldPulse = {
  animate: { opacity: [0.6, 1, 0.6] },
  transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
};
```

## Component patterns

### Buttons

- Primary: solid `bg-primary`, `text-primary-foreground`, used for the one main action per view
- Secondary: `bg-secondary`, `text-secondary-foreground`, outline style
- Ghost: transparent, hover `bg-accent`, for tertiary actions in toolbars
- Destructive: `bg-destructive`, rarely used, only for delete/void
- Link: text-primary underline on hover, inline in prose

Sizes:
- Default: `h-10 px-4` (40px tall), `text-body-sm`
- Large: `h-12 px-6` (48px tall), `text-body`, for patient-facing primary CTAs and landing hero
- Small: `h-8 px-3` (32px tall), for inline table actions
- Icon: square, 40x40

ONE primary button per view. If you have two primary buttons, one of them is secondary.

### Inputs

- Default: `h-10` (40px), `rounded` (10px), `border-input`, focus adds `ring-2 ring-ring ring-offset-2`
- Large (patient forms): `h-12`, `text-body-lg`
- Labels above inputs, always. Never just placeholders.
- Error state: border shifts to `border-destructive`, message below in `text-destructive text-body-sm`
- Helper text: below input, `text-muted-foreground text-body-sm`

### Cards

- `bg-card`, `rounded-[--radius-lg]` (16px), `shadow-sm`, `p-6`
- Border optional: `border border-border`
- Header: `text-h4` title, optional `text-caption text-muted-foreground` subtitle
- Content with `gap-4` or `gap-6` vertical rhythm

### Status badges

One colored pill per document status, consistent across the entire app.

| Status | Background | Text | Dot color |
|---|---|---|---|
| Draft | `bg-muted` | `text-muted-foreground` | Gray |
| Sent | `bg-info/10` | `text-info` | Soft blue |
| Viewed | `bg-info/15` | `text-info` | Soft blue (darker) |
| Signed | `bg-success/10` | `text-success` | Muted green |
| Expired | `bg-warning/10` | `text-warning-foreground` | Soft amber |
| Voided | `bg-destructive/10` | `text-destructive` | Muted coral |

Badge style: `px-2.5 py-0.5 rounded-[--radius-sm] text-caption font-medium` with a small 6px dot before the label.

### Loading states

Three patterns. Pick the right one.

1. **Skeleton**: shaped like the content (not a spinner), pulsing at 1500ms, use shadcn `Skeleton` component. Default for data-fetching pages.
2. **Inline spinner**: 16px spinner from lucide-react, for button loading states. Disables the button.
3. **Full-page loader**: NEVER on authenticated routes, only on initial auth check. Just an empty skeleton of the target page, no centered spinner.

### Empty states

Every list has an empty state. Structure:
- Soft icon or illustration (60-80px, `text-muted-foreground`)
- Title in `text-h4`
- Description in `text-body text-muted-foreground`, max-width 400px, centered
- Primary CTA button

Example for empty document list:
- Icon: `FileText` from lucide-react in a soft sage circle
- Title: "No documents yet"
- Description: "Upload your first PDF to start sending forms to patients"
- CTA: "Create document"

### Error states

Inline errors on forms: `text-destructive text-body-sm` below the field.

Toast errors: use sonner with `icon` from lucide-react, `variant` destructive, auto-dismiss 6000ms, include a retry action button when applicable.

Error boundary fallback: full-page card in the middle of the viewport, `AlertCircle` icon, "Something went wrong" heading, friendly copy, "Try again" button, optional "Go to dashboard" secondary.

## Iconography

- **Library**: lucide-react exclusively. Do not mix icon libraries.
- **Stroke weight**: 2 (lucide default)
- **Size**: 16px in buttons, 20px inline with text, 24px standalone, 40-60px in empty states
- **Color**: `currentColor`, so it inherits from parent text color
- **No emojis as icons** in UI chrome. Emojis fine in content like confirmations or celebratory moments, but not as functional icons.

Common icons (use these, don't invent):
- File: `FileText`
- Upload: `Upload`
- Download: `Download`
- Send: `Send`
- Signature: `PenLine`
- Patient/recipient: `User`
- Provider/clinic: `Stethoscope` (sparingly, a bit on-the-nose)
- Check/done: `CheckCircle2`
- Error: `AlertCircle`
- Warning: `AlertTriangle`
- Info: `Info`
- Settings: `Settings`
- More actions: `MoreHorizontal`
- Close: `X`

## Accessibility requirements

Non-negotiable on a medical app.

- Minimum WCAG AA: 4.5:1 contrast for body text, 3:1 for large text
- Every interactive element has a visible focus ring (never remove the focus outline)
- Every form input has a `<label>`, not just placeholder
- Color never communicates alone: status badges have both color AND text/icon
- Keyboard: Tab order follows visual order, Escape closes modals, Enter submits forms, Space activates buttons and checkboxes
- Screen reader: meaningful aria-labels on icon-only buttons, alt text on all images
- Forms have error summaries that are read aria-live on submission failure
- Signature pad: provide typed-name fallback for users who can't draw
- Respect `prefers-reduced-motion`: disable all motion if set
- Font size respects browser zoom, no fixed px on text that should scale
- Touch targets 44x44px minimum on mobile

## Patient-facing special rules

The signing page is different. Patients are anxious, possibly on old phones, possibly elderly, possibly not tech-savvy.

- Body text minimum 17px
- One primary action per screen, never ambiguous
- No secondary distractions during active signing (hide sidebar, hide nav)
- Large tap targets (48px minimum)
- Plenty of breathing room between elements
- Progress indicator visible at all times: "Field 2 of 5"
- Clear "Back" option to go back to previous field
- Confirmation before final submit: "Please review your signature. This action cannot be undone."
- Success state feels warm: soft check animation, "You're all set. Dr. Sharma's office has received your form."
- No upsells, no marketing, no newsletter signup. This is not a marketing funnel.

## Layout patterns

### Dashboard page layout

```
┌─────────────────────────────────────────────┐
│  Top bar: Logo  |  ...  |  UserButton       │
├──────┬──────────────────────────────────────┤
│      │                                      │
│ Nav  │  Page title + primary action         │
│      │                                      │
│      │  Content area                        │
│      │                                      │
└──────┴──────────────────────────────────────┘
```

Sidebar: 240px on desktop, collapses to hamburger on mobile.
Main content max-width: 1280px centered.

### Editor page layout

```
┌─────────────────────────────────────────────┐
│  Doc title | Draft badge | Cancel  Send →   │
├───────┬────────────────────────┬────────────┤
│       │                        │            │
│ Field │   PDF viewer           │ Properties │
│ types │   (scrollable)         │ / recipient│
│       │                        │            │
└───────┴────────────────────────┴────────────┘
```

Left sidebar: 200px, field palette
Center: PDF viewer, flexible
Right sidebar: 280px, properties panel

### Patient signing page layout (mobile-first)

```
┌─────────────────────────────────────────────┐
│       Clinic name                           │
│   Dr. Sharma sent you a form                │
├─────────────────────────────────────────────┤
│                                             │
│    PDF viewer with field overlays           │
│    (full width on mobile)                   │
│                                             │
├─────────────────────────────────────────────┤
│  Field 2 of 5          [     Next     ]    │
└─────────────────────────────────────────────┘
```

No sidebars on mobile. Progress + CTA pinned to bottom.

## Copy voice

- Warm but professional. Not chatty, not sterile.
- Sentence case for everything except proper nouns. "Create document" not "Create Document"
- Active voice. "We'll email Maria" not "Maria will be emailed"
- Patient-facing copy explains WHY: "We need your signature to confirm you've read this form"
- Error messages are human: "We couldn't send this document. Check the email address and try again" not "ERROR: 422 Unprocessable Entity"
- Never use exclamation points in neutral UI. Save them for genuine celebration like signing completion.
- Never use "sorry" as filler. Apologize only when actually at fault.
- Uppercase labels: sparingly, only for micro-labels like "RECIPIENTS" above a section

## Dark mode

**Not required for MVP. Phase 2 stretch if everything else is done.**

If added: follow shadcn's dark mode convention, use next-themes, override tokens in `.dark` selector. Keep dark mode softer than pure black (`oklch(0.12 0.01 250)` for background, not `#000`).
