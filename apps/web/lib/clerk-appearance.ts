import type { Appearance } from "@clerk/types";

/**
 * Clerk theming aligned with the ClinicSign design system.
 *
 * Passes semantic CSS variables (defined in globals.css) to Clerk via the
 * `variables` API so light/dark automatically match the rest of the app, and
 * strips Clerk's own card chrome via `elements` so the widget blends into our
 * (public) auth layout instead of stacking a second card on top.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorBackground: "var(--background)",
    colorText: "var(--foreground)",
    colorTextSecondary: "var(--muted-foreground)",
    colorInputBackground: "var(--background)",
    colorInputText: "var(--foreground)",
    colorNeutral: "var(--muted-foreground)",
    colorDanger: "var(--destructive)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--warning)",
    borderRadius: "10px",
    fontFamily: "var(--font-sans)",
    fontSize: "15px",
  },
  elements: {
    rootBox: "w-full",
    card: "w-full border-0 shadow-none bg-transparent p-0",
    header: "hidden",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    logoBox: "hidden",
    main: "gap-5",
    formFieldLabel: "text-caption text-foreground",
    formFieldInput:
      "h-10 rounded-md border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:ring-offset-1",
    formButtonPrimary:
      "h-10 rounded-md bg-primary text-primary-foreground font-medium shadow-none hover:bg-primary/90 active:bg-primary/95 normal-case",
    socialButtonsBlockButton:
      "h-10 rounded-md border-border bg-card text-foreground hover:bg-accent/60 normal-case",
    socialButtonsBlockButtonText: "font-medium",
    dividerLine: "bg-border",
    dividerText: "text-muted-foreground text-caption",
    footerAction: "hidden",
    footerActionText: "hidden",
    footerActionLink: "hidden",
    footer: "hidden",
    identityPreviewText: "text-foreground",
    identityPreviewEditButton: "text-primary hover:text-primary/80",
    formFieldErrorText: "text-destructive text-body-sm",
    alternativeMethodsBlockButton:
      "h-10 rounded-md border-border text-foreground hover:bg-accent/60",
  },
};
