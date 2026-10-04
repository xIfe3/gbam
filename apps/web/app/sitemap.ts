import type { MetadataRoute } from "next";
import { api } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import { FOOTER_GROUPS, HEADER_LINKS } from "@/lib/site-nav";

// Build the sitemap when it is requested, not at `next build`, because help and blog slugs
// come from the API and the build must work without the API running.
export const dynamic = "force-dynamic";

// Login and sign-up are marked noindex, so they stay out of the sitemap.
const LEFT_OUT = ["/login", "/signup"];

// Every marketing and legal path from the site navigation, once each.
function staticPaths(): string[] {
  const paths: string[] = [];
  for (const link of HEADER_LINKS) {
    if (!paths.includes(link.href) && !LEFT_OUT.includes(link.href)) {
      paths.push(link.href);
    }
  }
  for (const group of FOOTER_GROUPS) {
    for (const link of group.links) {
      if (!paths.includes(link.href) && !LEFT_OUT.includes(link.href)) {
        paths.push(link.href);
      }
    }
  }
  return paths;
}

// Slugs of published content. If the API is down we return none, so the sitemap still works.
async function contentSlugs(type: "help_article" | "blog_post"): Promise<string[]> {
  try {
    const entries = await api.listContent(type);
    const slugs: string[] = [];
    for (const entry of entries) {
      slugs.push(entry.slug);
    }
    return slugs;
  } catch (error) {
    console.error(`sitemap: could not list ${type}`, error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = staticPaths();
  const helpSlugs = await contentSlugs("help_article");
  for (const slug of helpSlugs) {
    paths.push(`/help/${slug}`);
  }
  const blogSlugs = await contentSlugs("blog_post");
  for (const slug of blogSlugs) {
    paths.push(`/blog/${slug}`);
  }

  const items: MetadataRoute.Sitemap = [];
  for (const path of paths) {
    let url = `${SITE_URL}${path}`;
    if (path === "/") {
      url = `${SITE_URL}/`;
    }
    items.push({ url });
  }
  return items;
}
