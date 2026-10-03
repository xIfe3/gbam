import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentUnavailable, formatDate } from "../../(marketing)/content-unavailable";
import { LegalToc } from "@/components/brand/legal-toc";
import { PillTabs } from "@/components/brand/pill-tabs";
import { Prose } from "@/components/brand/prose";
import { ShortVersion } from "@/components/brand/short-version";
import { ApiError, api } from "@/lib/api";
import type { ContentEntryDto } from "@/lib/api";
import { LEGAL_DOCS, LEGAL_LABELS } from "@/lib/site-nav";

export const dynamic = "force-dynamic";

type LegalSection = { id: string; heading: string; body: string; short: string };
type Loaded = { entry: ContentEntryDto | null; failed: boolean };

function isLegalDoc(doc: string): doc is (typeof LEGAL_DOCS)[number] {
  return (LEGAL_DOCS as readonly string[]).includes(doc);
}

// 404 from the API means "no such document"; any other error means the API is down.
async function load(doc: string): Promise<Loaded> {
  if (!isLegalDoc(doc)) {
    notFound();
  }
  try {
    const entry = await api.getContent("legal", doc);
    return { entry, failed: false };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return { entry: null, failed: true };
  }
}

// `data` is free-form frontmatter, so check its shape before trusting it.
function readSections(data: unknown): LegalSection[] {
  const sections: LegalSection[] = [];
  if (typeof data !== "object" || data === null || !("sections" in data)) {
    return sections;
  }
  const raw = data.sections;
  if (!Array.isArray(raw)) {
    return sections;
  }
  for (const item of raw) {
    if (
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "string" &&
      typeof item.heading === "string" &&
      typeof item.body === "string"
    ) {
      const short = typeof item.short === "string" ? item.short : "";
      sections.push({ id: item.id, heading: item.heading, body: item.body, short });
    }
  }
  return sections;
}

function readLastUpdated(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("lastUpdated" in data)) {
    return null;
  }
  const value = data.lastUpdated;
  if (typeof value === "string" && value !== "") {
    return value;
  }
  return null;
}

// Static descriptions so metadata does not need its own API call.
const DESCRIPTIONS: Record<(typeof LEGAL_DOCS)[number], string> = {
  terms: "The rules for using Gbam, for sellers and for customers ordering from a seller.",
  privacy: "What personal data Gbam collects, why, who we share it with, and your rights.",
  cookies: "Gbam uses a single essential login cookie. No analytics or advertising cookies.",
  refunds: "How refunds work on Gbam. Sellers refund customers directly.",
  "seller-agreement": "What sellers agree to when they open a shop on Gbam.",
  "acceptable-use": "What you may not sell or do on Gbam.",
  "data-deletion": "How to ask Gbam to delete your account and personal data.",
};

export async function generateMetadata({ params }: PageProps<"/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  if (!isLegalDoc(doc)) {
    return { title: "Legal" };
  }
  return { title: LEGAL_LABELS[doc], description: DESCRIPTIONS[doc] };
}

export default async function LegalDocPage({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  const { entry, failed } = await load(doc);

  const tabs = [];
  for (const slug of LEGAL_DOCS) {
    tabs.push({ href: `/legal/${slug}`, label: LEGAL_LABELS[slug] });
  }

  const sections = entry ? readSections(entry.data) : [];
  const lastUpdated = entry ? readLastUpdated(entry.data) : null;

  const sectionBlocks = [];
  for (const section of sections) {
    sectionBlocks.push(
      <section key={section.id} className="border-ink/10 border-t py-8">
        <h2
          id={section.id}
          className="font-display text-ink mb-4 scroll-mt-24 text-2xl leading-tight font-bold"
        >
          {section.heading}
        </h2>
        <div className="grid gap-5 xl:grid-cols-[1fr_16rem] xl:items-start">
          <Prose markdown={section.body} />
          {section.short !== "" && <ShortVersion>{section.short}</ShortVersion>}
        </div>
      </section>,
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <PillTabs items={tabs} activeHref={`/legal/${doc}`} label="Legal documents" />
      {failed && (
        <div className="mt-8">
          <ContentUnavailable what="This document" />
        </div>
      )}
      {entry && (
        <article className="mt-8">
          <h1 className="font-display text-ink text-4xl leading-tight font-black">{entry.title}</h1>
          {lastUpdated && (
            <p className="text-ink-muted mt-2 text-sm">Last updated {formatDate(lastUpdated)}</p>
          )}
          <p className="bg-coral-wash text-ink mt-4 rounded-xl p-3 text-sm font-bold">
            This is a draft pending legal review.
          </p>
          {entry.summary && <p className="text-ink-muted mt-4 max-w-prose">{entry.summary}</p>}
          {/* Contents list: inline at the top on mobile, a sticky right-hand rail from md up. */}
          <div className="mt-6 md:grid md:grid-cols-[1fr_14rem] md:gap-8">
            {sections.length > 0 && (
              <div className="md:sticky md:top-24 md:order-2 md:self-start">
                <LegalToc items={sections} />
              </div>
            )}
            <div className="md:order-1">{sectionBlocks}</div>
          </div>
        </article>
      )}
    </div>
  );
}
