import type { Metadata } from "next";
import { ContentUnavailable } from "../content-unavailable";
import { EmptyState } from "@/components/brand/empty-state";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";
import { api } from "@/lib/api";
import type { ContentSummary } from "@/lib/api";
import { HelpSearch } from "./help-search";

export const metadata: Metadata = {
  title: "Help centre",
  description: "Step-by-step guides for running your Gbam shop on WhatsApp.",
};

// Content comes from the API at request time, so `next build` never needs the API running.
export const dynamic = "force-dynamic";

export default async function HelpPage() {
  let articles: ContentSummary[] = [];
  let failed = false;
  try {
    articles = await api.listContent("help_article");
  } catch {
    failed = true;
  }

  return (
    <>
      <PageHeader
        eyebrow="Help centre"
        title="Answers, step by step"
        lead="How to set up your shop, get paid and keep customers updated."
        photo={{ description: "seller reading a guide on her phone" }}
      />
      <div className="mx-auto max-w-5xl px-4 pb-8">
        {failed && <ContentUnavailable what="Help articles" />}
        {!failed && articles.length === 0 && (
          <EmptyState
            title="No articles here yet"
            description="Email us and we'll help you directly, usually the same day."
          >
            <a
              href="mailto:support@gbam.app"
              className="text-brand focus-visible:outline-brand inline-flex min-h-11 items-center font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              support@gbam.app
            </a>
          </EmptyState>
        )}
        {!failed && articles.length > 0 && <HelpSearch articles={articles} />}
      </div>
      <CtaBand />
    </>
  );
}
