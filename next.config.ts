import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Runable/e2b preview proxy hosts to load dev resources (HMR, RSC, client bundles).
  // Without this, cross-origin dev assets are blocked and the page never hydrates.
  allowedDevOrigins: ["*.e2b.app", "*.e2b.dev", "*.runable.app", "*.runable.com"],
};

export default nextConfig;
