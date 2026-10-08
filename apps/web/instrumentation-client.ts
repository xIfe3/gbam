import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry-options";

/**
 * Runs in the visitor's browser before the page becomes interactive: turns on error alerts
 * (Sentry) for browser-side errors. NEXT_PUBLIC_ variables are copied into the browser code
 * when the site is BUILT, so NEXT_PUBLIC_SENTRY_DSN must be set at build time on Railway.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, environment: process.env.NODE_ENV, ...sentryOptions });
}

/** Lets Sentry note page changes, so an error report shows which page the visitor was on. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
