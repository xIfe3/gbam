import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "node:path";

// One .env for the whole monorepo, at the repo root. forceReload is required: Next has
// already loaded (and cached) env files from apps/web by the time this config runs.
loadEnvConfig(
  path.resolve(import.meta.dirname, "../.."),
  process.env.NODE_ENV !== "production",
  undefined,
  true,
);

const nextConfig: NextConfig = {
  // Needed for the Docker image in Phase 5 (copies only what `next start` needs).
  output: "standalone",
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
};

export default nextConfig;
