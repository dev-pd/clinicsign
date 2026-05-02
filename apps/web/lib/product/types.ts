export type ProductId = "clinic" | "generic";

export type ProductCopy = {
  id: ProductId;
  brandName: string;
  meta: {
    defaultTitle: string;
    dashboardTitleTemplate: string;
    description: string;
  };
  auth: {
    signInTitle: string;
    signUpTitle: string;
    signUpPrompt: string;
  };
  authSidePanel: {
    trustedLine: string;
    headlineLead: string;
    headlineAccent: string;
    description: string;
    bullets: ReadonlyArray<{ title: string; body: string }>;
    /** Use `{year}` for the current calendar year. */
    footerLineTemplate: string;
  };
  home: {
    heroEyebrow: string;
    heroTitleBeforeAccent: string;
    heroTitleAccent: string;
    heroDescription: string;
    heroFootnote: string;
    trustBarItems: readonly string[];
    howItWorksEyebrow: string;
    howItWorksTitle: string;
    howItWorksSubtitle: string;
    howItWorksSteps: ReadonlyArray<{ title: string; body: string }>;
    featureEyebrow: string;
    featureTitle: string;
    featureSubtitle: string;
    featureCards: ReadonlyArray<{ title: string; body: string }>;
    securityBadge: string;
    securityH2Lead: string;
    securityH2Accent: string;
    securityIntro: string;
    securityBullets: readonly string[];
    finalCtaTitle: string;
    finalCtaBody: string;
    footerDescriptor: string;
  };
  dashboard: {
    askAssistantLabel: string;
    syncCardTitle: string;
    syncCardBodyBeforeWebhook: string;
    syncCardBodyAfterWebhook: string;
  };
  documents: {
    newUploadStorageNote: string;
  };
  activity: {
    providerActorLabel: string;
  };
};
