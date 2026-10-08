import { scrubText } from "@gbam/shared";
import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Settings shared by the server and browser error alerts (Sentry). See instrumentation.ts
 * and instrumentation-client.ts.
 */
export const sentryOptions = {
  // What Sentry may collect on its own: nothing personal (no user details, cookies, headers,
  // form bodies, URL query values such as tracking keys, or code variables).
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    stackFrameVariables: false,
  },
  // Errors only. Performance tracing costs more and we don't need it yet.
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
};

/** Runs on every report just before it is sent: our last chance to remove private data. */
function scrubEvent(event: ErrorEvent): ErrorEvent {
  // The request can carry session cookies, headers and form data (passwords, codes).
  delete event.request;
  delete event.user;
  if (event.message) {
    event.message = scrubText(event.message);
  }
  const exceptions = event.exception?.values ?? [];
  for (const exception of exceptions) {
    if (exception.value) {
      exception.value = scrubText(exception.value);
    }
  }
  const breadcrumbs = event.breadcrumbs ?? [];
  for (const breadcrumb of breadcrumbs) {
    if (breadcrumb.message) {
      breadcrumb.message = scrubText(breadcrumb.message);
    }
    // Breadcrumb data can include URLs (with tracking keys) and request details.
    delete breadcrumb.data;
  }
  return event;
}
