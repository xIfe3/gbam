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
  experimental: {
    // Server Actions refuse request bodies over 1 MB by default. Product photos go through
    // one (max 10 MB each), and the limit counts multipart overhead too, so allow 11 MB.
    serverActions: { bodySizeLimit: "11mb" },
    // proxy.ts matches /dashboard/:path*, and Next buffers request bodies there (10 MB by
    // default, cutting off a bigger upload silently). Match the Server Action limit.
    proxyClientMaxBodySize: "11mb",
  },
};

export default nextConfig;
