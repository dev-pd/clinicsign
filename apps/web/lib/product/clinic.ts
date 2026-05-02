import type { ProductCopy } from "./types";

export const clinicProduct: ProductCopy = {
  id: "clinic",
  brandName: "ClinicSign",
  meta: {
    defaultTitle: "ClinicSign",
    dashboardTitleTemplate: "%s · ClinicSign",
    description: "HIPAA-aware document signing for medical practices",
  },
  auth: {
    signInTitle: "Sign in · ClinicSign",
    signUpTitle: "Create account · ClinicSign",
    signUpPrompt: "New to ClinicSign?",
  },
  authSidePanel: {
    trustedLine: "Trusted by forward-thinking clinics",
    headlineLead: "Sign medical forms in minutes,",
    headlineAccent: "not days.",
    description:
      "The calm, trustworthy alternative to bloated e-sign tools — built for medical practices that care about PHI.",
    bullets: [
      {
        title: "HIPAA-aware by default",
        body: "Private VPC, KMS-encrypted storage, short-lived signing URLs.",
      },
      {
        title: "Sent in seconds, signed in minutes",
        body: "Upload, drop fields, send. Your patient signs on any device.",
      },
      {
        title: "One flattened PDF per signature",
        body: "No fragile overlays. A real, archivable signed document every time.",
      },
    ],
    footerLineTemplate: "© {year} ClinicSign · HIPAA-aware document signing",
  },
  home: {
    heroEyebrow: "HIPAA-aware · Built for medical practices",
    heroTitleBeforeAccent: "Sign patient forms in minutes,",
    heroTitleAccent: "not days.",
    heroDescription:
      "ClinicSign is the calm, trustworthy alternative to bloated e-sign tools. Upload a PDF, drop fields on it, send a secure link. Your patient signs from any device. You get a flattened, audit-trailed copy in your inbox.",
    heroFootnote:
      "No credit card. Patients never create an account. Cancel anytime.",
    trustBarItems: [
      "Encrypted at rest with AWS KMS",
      "Private, audit-logged PHI handling",
      "Emails via authenticated domain",
      "Tamper-evident signed copy",
    ],
    howItWorksEyebrow: "How it works",
    howItWorksTitle: "Three steps. That's the whole product.",
    howItWorksSubtitle:
      "No onboarding call. No 40-tab settings area. Open, upload, send.",
    howItWorksSteps: [
      {
        title: "Upload a PDF",
        body: "Drag in any consent, intake, or release form. Drop signature, date, text, checkbox, and initial fields anywhere on the page.",
      },
      {
        title: "Send a signing link",
        body: "Enter the patient's name and email. They get a branded, single-use link. No account, no download, nothing to install.",
      },
      {
        title: "Get the signed copy",
        body: "The patient signs on any device. We flatten the values into the PDF, email both sides, and log every step to the audit trail.",
      },
    ],
    featureEyebrow: "What you get",
    featureTitle: "Everything you actually need. Nothing you don't.",
    featureSubtitle:
      "ClinicSign is small on purpose. We shipped the parts that matter and skipped the ones that make demos confusing.",
    featureCards: [
      {
        title: "Drag-to-place fields",
        body: "Signature, text, date, checkbox, initials. Snap them anywhere on any page. Exactly where you already mark a paper form.",
      },
      {
        title: "Magic-link signing",
        body: "Patients sign with a one-time tokenized link. No app, no sign-up, no password. Works from an email on any phone.",
      },
      {
        title: "Flattened signed PDF",
        body: "Values are baked into the PDF at sign time. Not a fragile XFDF overlay. You get a real, archivable document.",
      },
      {
        title: "Full audit trail",
        body: "Every create, send, view, resend, and sign event is logged with IP, user-agent, and timestamp — ready for your compliance file.",
      },
      {
        title: "Private by default",
        body: "PostgreSQL in a private subnet. S3 with KMS encryption. Presigned, short-lived URLs. No direct bucket access from the browser.",
      },
      {
        title: "Fast enough to demo",
        body: "Most forms are sent, opened, and signed in under five minutes. The sig pad is smooth on a trackpad and usable with a finger.",
      },
    ],
    securityBadge: "Security · Compliance",
    securityH2Lead: 'Built like a system that handles PHI —',
    securityH2Accent: "because it does.",
    securityIntro:
      "HIPAA posture isn't a feature flag, it's the architecture. Private networking, encrypted storage, short-lived URLs, and a full audit log come standard on every document.",
    securityBullets: [
      "Database in a private VPC subnet, no public access.",
      "Objects encrypted with a dedicated KMS key. URLs expire in five minutes.",
      "Single-use signing tokens, hashed at rest, rotated on every resend.",
      "Immutable audit log per document: who, what, when, from where.",
      "No PHI in logs. No third-party analytics. No ad pixels.",
    ],
    finalCtaTitle: "Ready to stop chasing paper?",
    finalCtaBody:
      "Create an account in under a minute. Your first document can be signed before your next patient walks in.",
    footerDescriptor: "HIPAA-aware document signing",
  },
  dashboard: {
    askAssistantLabel: "Ask ClinicSign",
    syncCardTitle: "Syncing your account",
    syncCardBodyBeforeWebhook:
      "Your Clerk session is active, but your ClinicSign profile is not in our database yet. For new signups this is usually the Clerk webhook creating your clinic — confirm the",
    syncCardBodyAfterWebhook: "and retry in a moment.",
  },
  documents: {
    newUploadStorageNote:
      "PDFs are stored encrypted and only accessible to your clinic.",
  },
  activity: {
    providerActorLabel: "Clinician",
  },
};
