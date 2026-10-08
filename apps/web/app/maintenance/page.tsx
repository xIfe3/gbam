import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Logo } from "@/components/brand/logo";
import { getPlatformInfo } from "@/lib/platform-info";

export const metadata: Metadata = {
  title: "Back soon",
  robots: { index: false, follow: false },
};

/** "Back by 3:00 pm" in Lagos time. */
function backByText(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}

/**
 * Shown instead of a page while maintenance mode is on (proxy.ts rewrites to it). Reads the
 * current status itself, so it can say what's happening and when we expect to be back.
 */
export default async function MaintenancePage() {
  // Read the status on every visit, never at build time.
  await connection();
  const info = await getPlatformInfo();
  const level = info?.maintenance.level ?? "off";
  const message = info?.maintenance.message ?? null;
  const backBy = info?.maintenance.backBy ?? null;

  let title = "Gbam is down for a short update";
  let body = "We'll be back shortly. Thanks for your patience.";
  if (level === "pause") {
    title = "Ordering is paused for a short while";
    body = "Shops are still open to browse. Please try ordering again soon.";
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
      <Logo size="md" />
      {level === "off" && (
        <>
          <h1 className="font-display text-ink mt-10 text-4xl font-black">We&apos;re back</h1>
          <Link href="/" className="text-brand-hover mt-6 font-bold underline">
            Go to Gbam
          </Link>
        </>
      )}
      {level !== "off" && (
        <>
          <h1 className="font-display text-ink mt-10 max-w-md text-4xl leading-tight font-black">
            {title}
          </h1>
          <p className="text-ink-muted mt-4 max-w-md text-lg">{body}</p>
          {message && <p className="text-ink mt-4 max-w-md">{message}</p>}
          {backBy && <p className="text-ink-muted mt-4 text-sm">Back by {backByText(backBy)}</p>}
        </>
      )}
    </main>
  );
}
