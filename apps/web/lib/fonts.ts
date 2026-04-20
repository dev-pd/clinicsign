/**
 * Font loading for ClinicSign
 * All fonts are self-hosted via next/font to prevent layout shift and
 * meet HIPAA-friendly "no external requests" posture for the main app.
 *
 * Usage in apps/web/app/layout.tsx:
 *   import { fonts } from "@/lib/fonts";
 *   ...
 *   <html lang="en" className={fonts}>
 */

import { Inter, Source_Serif_4, JetBrains_Mono, Great_Vibes } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-source-serif",
  weight: ["400", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

const greatVibes = Great_Vibes({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-great-vibes",
  weight: ["400"],
});

/**
 * Composed class string to apply on <html> so all font variables
 * are available globally via the @theme inline mapping in globals.css.
 */
export const fonts = [
  inter.variable,
  sourceSerif.variable,
  jetbrainsMono.variable,
  greatVibes.variable,
].join(" ");
