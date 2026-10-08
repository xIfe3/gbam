// Error boundaries must be client components: React calls them in the browser.
"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/brand/button";
import { Logo } from "@/components/brand/logo";

// `error` is deliberately never shown: its message could leak internal details.
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  // Report it to Sentry once when this page appears (does nothing if Sentry is off).
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
      <Logo size="md" />
      <h1 className="font-display text-ink mt-10 max-w-md text-4xl leading-tight font-black">
        Something went wrong on our side
      </h1>
      <p className="text-ink-muted mt-4 max-w-md text-lg">
        It isn&apos;t you. Please try again, and if it keeps happening, email support@gbam.app.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="primary" size="lg" onClick={() => reset()}>
          Try again
        </Button>
        <Button href="/" variant="secondary" size="lg">
          Back to home
        </Button>
      </div>
    </main>
  );
}
