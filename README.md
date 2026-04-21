# ClinicSign Starter Kit

Everything you need to build ClinicSign as a take-home work trial.

## How to use this

1. **Unzip this into an empty folder** that will become your repo
2. **Initialize git**: `git init`
3. **Open the folder in Cursor**
4. **Follow `_setup/CURSOR_PROMPTS.md`** in order. It contains every Cursor prompt for Phase 1 and Phase 2.

That's it. The files are already in the right place. Cursor reads them automatically.

## What's in here

```
clinicsign/
├── .cursor/rules/              <- 12 rules, auto-loaded by Cursor
│   ├── 00-core.mdc             always applied: engineering principles
│   ├── 01-typescript.mdc       TS/TSX files
│   ├── 02-nextjs-frontend.mdc  apps/web files
│   ├── 03-node-backend.mdc     apps/api files
│   ├── 04-prisma-database.mdc  Prisma and repositories
│   ├── 05-aws-infra.mdc        Docker, AWS services
│   ├── 06-testing.mdc          test files
│   ├── 07-security.mdc         always applied: security
│   ├── 08-commit-discipline.mdc always applied: git + pre-commit
│   ├── 09-clinicsign-project.mdc always applied: project context
│   ├── 10-ai-agent.mdc         AI service files (Phase 2)
│   └── 11-design-system.mdc    apps/web UI files
├── PROJECT.md                  spec: data model, API, flows
├── apps/web/
│   ├── DESIGN_SYSTEM.md        design tokens reference
│   ├── app/globals.css         CSS variables (OKLCH color tokens)
│   ├── lib/fonts.ts            next/font setup
│   ├── lib/motion.ts           Framer Motion presets
│   └── components/ui/
│       ├── status-badge.tsx    reusable status pill
│       └── empty-state.tsx     reusable empty state
└── _setup/                     <- NOT part of your app, just instructions for you
    ├── CURSOR_PROMPTS.md       run these in Cursor, one at a time
    ├── CURSOR_USER_SETTINGS.md paste into Cursor settings, not the repo
    └── pre-commit-hook.sh      Husky pre-commit hook
```

## The _setup folder

The `_setup/` folder is NOT code. It's instructions for you. Delete it after you're done setting up, or gitignore it. Don't let Cursor think it's part of the app.

Three files:

- **`CURSOR_PROMPTS.md`** - the main playbook. Phase 1 has prompts P1.1 through P1.12. Phase 2 (AI features) has P2.1 through P2.4. Run them in order.
- **`CURSOR_USER_SETTINGS.md`** - a one-time Cursor configuration. Open Cursor Settings, paste the content into "Rules for AI". Applies globally across all your projects.
- **`pre-commit-hook.sh`** - install as a Husky pre-commit hook after you set up Husky in P1.3 or later.

## Before you run a single Cursor prompt

Sign up for these services (5 minutes):

1. **Clerk** (clerk.com) - create app, enable Google OAuth, save keys
2. **Anthropic** (console.anthropic.com) - only if doing Phase 2, $10 credit
3. **AWS** (aws.amazon.com) - can wait until P1.12 deployment
4. **Resend** (resend.com) - free tier, easier than SES for dev
5. **Vercel** (vercel.com) - free, for frontend deploy

Put the keys in a local notes file. You'll need them in `.env.local` and `.env` files later.

## Clerk webhook from localhost (tunnel)

Clerk must call your API over **HTTPS** on the public internet. Your Express API runs at `http://localhost:4000`, so you expose it with a tunnel.

**1. Start the API** (from the repo root: `npm run dev`, or run only `@clinicsign/api` so port **4000** is listening).

**2. Start a tunnel** (second terminal), using **one** of:

| Command | What you need |
|--------|----------------|
| `npm run tunnel:api` | **ngrok** on your PATH. On macOS: `brew install ngrok/ngrok/ngrok`. **First time only:** create a free account at [ngrok](https://dashboard.ngrok.com/signup), then run `ngrok config add-authtoken <token>` from [Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken). |
| `npm run tunnel:api:lt` | **No ngrok account.** Uses `localtunnel` (installed with the repo). Less reliable than ngrok; fine for quick tests. |

**3. Copy the HTTPS URL** the tunnel prints (ngrok shows a `Forwarding` line like `https://abcd.ngrok-free.app`; localtunnel prints a `loca.lt` URL).

**4. In Clerk** → **Configure** → **Webhooks** → **Add endpoint**:

- URL: `https://<tunnel-host>/api/webhooks/clerk` (example: `https://abcd.ngrok-free.app/api/webhooks/clerk`)
- Events: at least `user.created` (optional: `user.updated`, `user.deleted`)

**5. Copy the endpoint Signing secret** (`whsec_…`) into your repo root **`.env`** as `CLERK_WEBHOOK_SECRET=`, then **restart the API**.

**6. Test** by signing in at `http://localhost:3000` or sending a test event from the webhook page. If the tunnel URL changes (new ngrok session), update the endpoint URL in Clerk.

## Immediately after unzipping

```bash
# 1. Init git
git init

# 2. Set up Cursor user settings (one-time)
#    Open Cursor > Settings > General > Rules for AI
#    Paste contents of _setup/CURSOR_USER_SETTINGS.md

# 3. Start with the first prompt
#    Open _setup/CURSOR_PROMPTS.md
#    Find "P1.1 - Monorepo scaffolding"
#    Paste the prompt into Cursor chat
#    Review the generated code
#    Commit

# 4. Continue through P1.1a, P1.2, P1.3, ...
```

## Build order summary

- **P1.1**: scaffold the monorepo
- **P1.1a**: wire up the design system (CRITICAL, do before any UI)
- **P1.2**: Prisma schema and migrations
- **P1.3**: API core infrastructure
- **P1.4**: Clerk authentication
- **P1.5**: document CRUD APIs
- **P1.6**: sending + patient signing APIs
- **P1.7**: landing page + dashboard
- **P1.8**: document editor
- **P1.9**: patient signing page
- **P1.10**: document detail page
- **P1.11**: polish + tests
- **P1.12**: deploy to AWS + Vercel

Stop at P1.12. Verify everything works end-to-end with real users.

Only then, if time permits, move to Phase 2:
- **P2.1**: AI auto-detect fields (Claude vision)
- **P2.2**: plain-language summary for patients
- **P2.3**: chat with document (stretch)
- **P2.4**: final README + Loom recording

## When you get the actual assignment prompt

Paste it into Claude chat. I will review it and tell you what to adjust in PROJECT.md before you start coding. The plan here is designed for the ideal case; the real prompt may have constraints we need to honor.

## Good luck bossman

You have a clean repo, strong rules, a real design system, and a tested plan. Believe in yourself. Build methodically. Commit often. Ship Phase 1 before Phase 2. You will get this job.
