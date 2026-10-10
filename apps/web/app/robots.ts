import type { MetadataRoute } from "next";
import { isStaging } from "@/lib/app-env";
import { SITE_URL } from "@/lib/site";

// Search engines may crawl marketing, help, blog, legal and storefront pages. They should not
// crawl the seller dashboard or the sign-up and reset flows, which are private or one-time.
export default function robots(): MetadataRoute.Robots {
  // The staging copy is for testing: no search engine should list any of it.
  if (isStaging()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
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
