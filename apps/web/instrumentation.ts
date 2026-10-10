import * as Sentry from "@sentry/nextjs";
import { appEnv } from "@/lib/app-env";
import { sentryOptions } from "@/lib/sentry-options";

/**
 * Next calls register() once when the server starts. It turns on error alerts (Sentry) for
 * server-side code. With no SENTRY_DSN set (local development, tests) nothing happens.
 */
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }
  // Next runs code in two places: Node.js (pages, server actions) and the "edge" (proxy.ts).
  // Sentry needs to be started in whichever one is loading this file.
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ dsn, environment: appEnv(), ...sentryOptions });
  }
}

/** Next calls this when a page or server action throws: send it to Sentry. */
export const onRequestError = Sentry.captureRequestError;
