import type { ProductCopy } from "./types";

export const genericProduct: ProductCopy = {
  id: "generic",
  brandName: "SignKit",
  meta: {
    defaultTitle: "SignKit",
    dashboardTitleTemplate: "%s · SignKit",
    description: "Upload, send, and sign PDFs with a simple audit trail",
  },
  auth: {
    signInTitle: "Sign in · SignKit",
    signUpTitle: "Create account · SignKit",
    signUpPrompt: "New to SignKit?",
  },
  authSidePanel: {
    trustedLine: "Built for teams that move fast",
    headlineLead: "Send agreements in minutes,",
    headlineAccent: "not meetings.",
    description:
      "Simple PDF signing for admins and recipients—encryption, audit trail, and no recipient accounts required.",
    bullets: [
      {
        title: "Secure by design",
        body: "Encrypted storage, time-boxed signing links, least-privilege access.",
      },
      {
        title: "Fast to send",
        body: "Upload, place fields, email a link. Recipients sign on any device.",
      },
      {
        title: "Real signed PDFs",
        body: "Flattened output you can archive—not a stack of fragile overlays.",
      },
    ],
    footerLineTemplate: "© {year} SignKit · Secure document signing",
  },
  home: {
    heroEyebrow: "Simple e-sign · Built for real workflows",
    heroTitleBeforeAccent: "PDF signing without the",
    heroTitleAccent: "busywork.",
    heroDescription:
      "Upload a PDF, place fields, send a secure link. Recipients sign in a browser without an account. You get a flattened PDF and an append-only audit trail.",
    heroFootnote:
      "No credit card. Recipients never create an account. Cancel anytime.",
    trustBarItems: [
      "Encrypted object storage",
      "Audit log on every state change",
      "Transactional email you can trust",
      "Single-use signing links",
    ],
    howItWorksEyebrow: "How it works",
    howItWorksTitle: "Three steps from upload to signed PDF.",
    howItWorksSubtitle:
      "No enterprise procurement story. Open the editor, send the link, done.",
    howItWorksSteps: [
      {
        title: "Upload a PDF",
        body: "Drop any agreement or form. Add signature, date, text, checkbox, or initial fields wherever they belong.",
      },
      {
        title: "Send a signing link",
        body: "Enter the recipient's name and email. They get a single-use link—no app, no password.",
      },
      {
        title: "Download the signed copy",
        body: "We flatten values into the PDF, notify both sides, and record each step for auditing.",
      },
    ],
    featureEyebrow: "What you get",
    featureTitle: "Focused signing. No bloat.",
    featureSubtitle:
      "SignKit keeps the surface area small: editor, send, sign, audit. Everything else is out of scope on purpose.",
    featureCards: [
      {
        title: "Drag-to-place fields",
        body: "Place fields precisely on the page. Snap and align helpers keep stacks tidy.",
      },
      {
        title: "Magic-link signing",
        body: "Recipients sign via one short-lived tokenized URL—mobile-friendly, no login.",
      },
      {
        title: "Flattened signed PDF",
        body: "A real PDF baked with field values—not a pile of viewer-only overlays.",
      },
      {
        title: "Full audit trail",
        body: "Create, send, view, resend, sign—each event is recorded with context and timestamp.",
      },
      {
        title: "Private by default",
        body: "Objects live in encrypted storage with presigned, short-lived download URLs.",
      },
      {
        title: "Fast to try",
        body: "Most documents go from draft to signed in one sitting when both sides are available.",
      },
    ],
    securityBadge: "Security",
    securityH2Lead: "Built for teams that need",
    securityH2Accent: "evidence, not vibes.",
    securityIntro:
      "Encryption in transit and at rest, hashed signing tokens, and an append-only audit log give you a defensible story for internal review.",
    securityBullets: [
      "Network-isolated data plane in production-shaped deployments.",
      "Dedicated encryption keys for stored documents.",
      "Single-use tokens, rotated on resend, hashed at rest.",
      "Immutable audit records tied to each document.",
      "Structured logging without stuffing sensitive payloads into log lines.",
    ],
    finalCtaTitle: "Ship your next agreement faster.",
    finalCtaBody:
      "Create an account in under a minute and send your first document the same day.",
    footerDescriptor: "Secure document signing",
  },
  dashboard: {
    askAssistantLabel: "Ask assistant",
    syncCardTitle: "Syncing your account",
    syncCardBodyBeforeWebhook:
      "Your sign-in session is active, but your workspace profile is not in our database yet. For new accounts this is usually the webhook provisioning your organization — confirm the",
    syncCardBodyAfterWebhook: "and retry in a moment.",
  },
  documents: {
    newUploadStorageNote:
      "PDFs are stored encrypted and only accessible to your organization.",
  },
  activity: {
    providerActorLabel: "Sender",
  },
};
