import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentUnavailable } from "../../content-unavailable";
import { Prose } from "@/components/brand/prose";
import { ApiError, api } from "@/lib/api";
import type { ContentEntryDto } from "@/lib/api";

export const dynamic = "force-dynamic";

type Loaded = { entry: ContentEntryDto | null; failed: boolean };

// 404 from the API means "no such article"; any other error means the API is down.
async function load(slug: string): Promise<Loaded> {
  try {
    const entry = await api.getContent("help_article", slug);
    return { entry, failed: false };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return { entry: null, failed: true };
  }
}

export async function generateMetadata({ params }: PageProps<"/help/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { entry } = await load(slug);
  if (!entry) {
    return { title: "Help centre" };
  }
  const metadata: Metadata = { title: entry.title };
  if (entry.summary) {
    metadata.description = entry.summary;
  }
  return metadata;
}

export default async function HelpArticlePage({ params }: PageProps<"/help/[slug]">) {
  const { slug } = await params;
  const { entry, failed } = await load(slug);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Link
        href="/help"
        className="text-brand focus-visible:outline-brand inline-flex min-h-11 items-center text-sm font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Back to help centre
      </Link>
      {failed && <ContentUnavailable what="This article" />}
      {entry && (
        <>
          {entry.category && (
            <p className="text-coral-deep mt-4 text-xs font-bold tracking-widest uppercase">
              {entry.category}
            </p>
          )}
          <h1 className="font-display text-ink mt-2 mb-6 text-4xl leading-tight font-black">
            {entry.title}
          </h1>
          <Prose markdown={entry.body} />
          <p className="text-ink-muted mt-10 text-sm">
            Still stuck? Email{" "}
            <a className="text-brand underline" href="mailto:support@gbam.app">
              support@gbam.app
            </a>
            .
          </p>
        </>
      )}
    </article>
  );
}
