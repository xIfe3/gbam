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

/**
 * Safety headers on every page:
 * - Strict-Transport-Security: browsers only ever use https for this site from now on.
 * - X-Frame-Options DENY: no other site can show our pages inside a frame (that's how
 *   "clickjacking" tricks people into tapping a hidden Pay button).
 * - X-Content-Type-Options nosniff: browsers trust our file types instead of guessing.
 * - Referrer-Policy: other sites only see "gbam.zephra.dev", never a full address, which
 *   can hold an order's private key (/pay/GB-XXXX?k=…).
 * A Content-Security-Policy is left out for now: it needs testing with the Paystack pop-up.
 */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Don't send "X-Powered-By: Next.js": it only helps someone looking for a known bug.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
