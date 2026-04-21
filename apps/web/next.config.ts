import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@clinicsign/shared-types"],
  /**
   * Next 16 defaults to Turbopack for `next build`; we use `--webpack` in scripts
   * so this alias (required by pdfjs in the browser) still applies.
   * When migrating to default Turbopack builds, add the equivalent `turbopack.resolveAlias`.
   */
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
