/**
 * Motion presets for ClinicSign
 * Use these instead of inline framer-motion variants so every animation
 * is consistent across the app.
 *
 * Usage:
 *   import { motion } from "framer-motion";
 *   import { fadeInUp } from "@/lib/motion";
 *   <motion.div {...fadeInUp}>...</motion.div>
 */

import type { Transition, Variants } from "framer-motion";

// Easing curves, matching globals.css
export const easeOut = [0, 0, 0.2, 1] as const;
export const easeIn = [0.4, 0, 1, 1] as const;
export const easeInOut = [0.4, 0, 0.2, 1] as const;

// Duration tokens in seconds (framer-motion uses seconds)
export const durations = {
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
} as const;

// Simple fade
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: durations.base, ease: easeOut },
};

// Fade + slight upward slide, for dialogs and cards appearing
export const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
  transition: { duration: durations.base, ease: easeOut },
};

// Slide from right, for toasts and side panels
export const slideInRight = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 },
  transition: { duration: durations.base, ease: easeOut },
};

// Stagger children, useful for lists appearing
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.base, ease: easeOut },
  },
};

// Pulse for signature field highlighting on patient signing page
export const fieldPulse = {
  animate: { opacity: [0.6, 1, 0.6] },
  transition: {
    duration: 2,
    repeat: Infinity,
    ease: "easeInOut" as const,
  },
};

// Button press, applied via whileTap
export const buttonTap = { scale: 0.98 };

// Reduced-motion helper: wrap any motion config in this to auto-disable
// when user prefers reduced motion. Use with the `useReducedMotion` hook
// from framer-motion.
export function reduceMotion<T extends { transition?: Transition }>(
  config: T,
  shouldReduce: boolean
): T {
  if (!shouldReduce) return config;
  return {
    ...config,
    transition: { ...(config.transition ?? {}), duration: 0 },
  };
}
