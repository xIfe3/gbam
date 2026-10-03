"use client";

import Link from "next/link";
import { useId, useState } from "react";

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string | null;
  category: string | null;
};

// Does the article's title or summary contain the (lower-cased) query?
function matches(article: HelpArticle, query: string): boolean {
  if (article.title.toLowerCase().includes(query)) {
    return true;
  }
  if (article.summary && article.summary.toLowerCase().includes(query)) {
    return true;
  }
  return false;
}

// Groups articles by category, keeping the order the API gave us.
function groupByCategory(articles: HelpArticle[]): { category: string; items: HelpArticle[] }[] {
  const groups: { category: string; items: HelpArticle[] }[] = [];
  for (const article of articles) {
    let name = "More help";
    if (article.category) {
      name = article.category;
    }
    let group = groups.find((g) => g.category === name);
    if (!group) {
      group = { category: name, items: [] };
      groups.push(group);
    }
    group.items.push(article);
  }
  return groups;
}

// Client-side search over the article list (it is small, so no server round trip).
export function HelpSearch({ articles }: { articles: HelpArticle[] }) {
  const [query, setQuery] = useState("");
  const inputId = useId();

  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();
  let shown = articles;
  if (needle.length > 0) {
    shown = articles.filter((a) => matches(a, needle));
  }
  const groups = groupByCategory(shown);

  return (
    <div>
      <label htmlFor={inputId} className="text-ink mb-1.5 block text-sm font-bold">
        Search help articles
      </label>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. payment"
        className="border-brand-tint text-ink placeholder:text-ink-subtle focus-visible:outline-brand min-h-11 w-full rounded-xl border-2 bg-white px-4 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
      />

      <div aria-live="polite">
        {shown.length === 0 && (
          <p className="text-ink-muted mt-6">
            {`No articles match "${trimmed}". Try "payment" or contact support@gbam.app.`}
          </p>
        )}
      </div>

      {groups.map((group) => (
        <section key={group.category} className="mt-8">
          <h2 className="font-display text-ink mb-3 text-2xl font-bold">{group.category}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {group.items.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/help/${article.slug}`}
                  className="focus-visible:outline-brand block min-h-11 rounded-2xl bg-white p-4 hover:bg-coral-wash focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="text-ink block font-bold">{article.title}</span>
                  {article.summary && (
                    <span className="text-ink-muted mt-1 block text-sm">{article.summary}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
