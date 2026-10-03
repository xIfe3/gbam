import type { Metadata } from "next";
import { ContentUnavailable } from "../content-unavailable";
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
        {!failed && <HelpSearch articles={articles} />}
      </div>
      <CtaBand />
    </>
  );
}
