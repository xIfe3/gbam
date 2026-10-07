import type { Metadata } from "next";
import { ContentUnavailable } from "../content-unavailable";
import { EmptyState } from "@/components/brand/empty-state";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";
import { Prose } from "@/components/brand/prose";
import { api } from "@/lib/api";
import type { ContentEntryDto } from "@/lib/api";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Quick answers about selling with Gbam: orders, payments, payouts and WhatsApp.",
};

export const dynamic = "force-dynamic";

// Groups entries by category, keeping the API's order.
function group(entries: ContentEntryDto[]): { category: string; items: ContentEntryDto[] }[] {
  const groups: { category: string; items: ContentEntryDto[] }[] = [];
  for (const entry of entries) {
    let name = "General";
    if (entry.category) {
      name = entry.category;
    }
    let found = groups.find((g) => g.category === name);
    if (!found) {
      found = { category: name, items: [] };
      groups.push(found);
    }
    found.items.push(entry);
  }
  return groups;
}

export default async function FaqPage() {
  let entries: ContentEntryDto[] = [];
  let failed = false;
  try {
    const summaries = await api.listContent("faq");
    entries = await Promise.all(summaries.map((s) => api.getContent("faq", s.slug)));
  } catch {
    failed = true;
  }
  const groups = group(entries);

  return (
    <>
      <PageHeader
        eyebrow="FAQ"
        title="Quick answers"
        lead="The questions sellers ask us most. Not here? Email support@gbam.app."
        photo={{
          description: "seller checking a question on her phone",
          src: "/images/pages/faq.webp",
          alt: "A woman waving as she looks at her phone",
        }}
      />
      <div className="mx-auto max-w-3xl px-4 pb-8">
        {failed && <ContentUnavailable what="The FAQ" />}
        {!failed && groups.length === 0 && (
          <EmptyState
            title="No questions here yet"
            description="Ask us anything and we'll answer directly."
          >
            <a
              href="mailto:support@gbam.app"
              className="text-brand focus-visible:outline-brand inline-flex min-h-11 items-center font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              support@gbam.app
            </a>
          </EmptyState>
        )}
        {groups.map((g) => (
          <section key={g.category} className="mt-8">
            <h2 className="font-display text-ink mb-3 text-2xl font-bold">{g.category}</h2>
            <div className="flex flex-col gap-3">
              {g.items.map((entry) => (
                <details key={entry.slug} className="rounded-2xl bg-white p-5">
                  <summary className="text-ink focus-visible:outline-brand flex min-h-11 cursor-pointer items-center font-bold focus-visible:outline-2 focus-visible:outline-offset-2">
                    {entry.title}
                  </summary>
                  <div className="mt-2">
                    <Prose markdown={entry.body} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
      <CtaBand />
    </>
  );
}
