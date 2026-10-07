import type { Metadata } from "next";
import { ContentUnavailable, formatDate } from "../content-unavailable";
import { EmptyState } from "@/components/brand/empty-state";
import { PageHeader } from "@/components/brand/page-header";
import { Prose } from "@/components/brand/prose";
import { api } from "@/lib/api";
import type { ContentEntryDto } from "@/lib/api";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What has shipped in Gbam, newest first.",
};

export const dynamic = "force-dynamic";

export default async function ChangelogPage() {
  let entries: ContentEntryDto[] = [];
  let failed = false;
  try {
    const summaries = await api.listContent("changelog");
    entries = await Promise.all(summaries.map((s) => api.getContent("changelog", s.slug)));
  } catch {
    failed = true;
  }

  return (
    <>
      <PageHeader
        eyebrow="Changelog"
        title="What's new in Gbam"
        lead="We are early and building in the open. Here is what has shipped."
        photo={{
          description: "team shipping an update",
          src: "/images/pages/changelog.webp",
          alt: "A small team working together around a laptop",
        }}
      />
      <div className="mx-auto max-w-3xl px-4 pb-16">
        {failed && <ContentUnavailable what="The changelog" />}
        {!failed && entries.length === 0 && (
          <EmptyState
            title="Nothing new yet"
            description="Updates will show up here as we ship them."
          />
        )}
        <ol className="flex flex-col gap-6">
          {entries.map((entry) => (
            <li key={entry.slug} className="rounded-2xl bg-white p-6">
              <p className="text-ink-muted text-sm">{formatDate(entry.publishedAt)}</p>
              <h2 className="font-display text-ink mt-1 text-2xl font-bold">{entry.title}</h2>
              <Prose markdown={entry.body} />
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
