import { permanentRedirect } from "next/navigation";
import { ApiError } from "./api";

// A shop link: lowercase letters, numbers and hyphens (so it's safe to put in an address).
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A shop that changed its link answers its old one with "moved" and the new link. This sends
 * the visitor there for good (a permanent redirect, so search engines update too). `pathFor`
 * builds the same page on the new link, e.g. slug => `/${slug}/jollof-rice`.
 */
export function redirectIfShopMoved(error: unknown, pathFor: (slug: string) => string): void {
  if (!(error instanceof ApiError) || error.status !== 404) {
    return;
  }
  const body = error.body;
  if (typeof body !== "object" || body === null) {
    return;
  }
  if (!("code" in body) || body.code !== "SHOP_MOVED" || !("slug" in body)) {
    return;
  }
  const slug = body.slug;
  if (typeof slug === "string" && SLUG.test(slug)) {
    permanentRedirect(pathFor(slug));
  }
}
