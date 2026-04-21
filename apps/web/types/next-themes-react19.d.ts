import type { ReactNode } from "react";

/** next-themes + @types/react 19: ensure ThemeProvider accepts children across a mixed dependency graph. */
declare module "next-themes" {
  interface ThemeProviderProps {
    children?: ReactNode;
  }
}
