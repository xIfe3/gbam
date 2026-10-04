import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Search engines may crawl marketing, help, blog, legal and storefront pages. They should not
// crawl the seller dashboard or the sign-up and reset flows, which are private or one-time.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Disallow rules are prefix matches, so "/dashboard" alone would also block a storefront
      // called "/dashboardcafe". "$" means "exactly this path"; a trailing "/" means "below it".
      disallow: ["/dashboard$", "/dashboard/", "/signup/", "/reset-password$", "/forgot-password$"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
