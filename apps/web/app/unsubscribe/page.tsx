import type { Metadata } from "next";
import { AuthCard } from "@/components/brand/auth-card";
import { UnsubscribeForm } from "./unsubscribe-form";

// The link carries a signed token: keep the page out of search results and referrers.
export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false },
  referrer: "no-referrer",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * /unsubscribe?s=…&t=…, the link at the bottom of Gbam's news and tips emails. Opening it
 * changes nothing (email apps and virus scanners open links on their own); the button does.
 */
export default async function UnsubscribePage(props: Props) {
  const searchParams = await props.searchParams;
  const sellerId = searchParams.s;
  const token = searchParams.t;
  const complete = typeof sellerId === "string" && typeof token === "string" && token !== "";

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <AuthCard
        title="Unsubscribe from news and tips"
        subtitle="Emails about your orders, payments and account will still come."
      >
        {complete && <UnsubscribeForm sellerId={sellerId} token={token} />}
        {!complete && (
          <p className="text-ink-muted text-sm">
            This link isn&apos;t complete. You can switch news and tips off in Settings → Emails in
            your dashboard.
          </p>
        )}
      </AuthCard>
    </main>
  );
}
