import type { MarketingPage } from "@gbam/shared";

function textOf(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

const HEADER_KEYS = ["eyebrow", "title", "lead", "photoSrc", "photoAlt", "ctaLabel"] as const;

/**
 * A marketing page's form, as the fields saved for the page. The inputs are named like
 * "header.title" and "tiles.0.text"; the API checks the result against the page's fields.
 */
export function marketingDataFromForm(
  page: MarketingPage,
  formData: FormData,
): Record<string, unknown> {
  const data: Record<string, unknown> = { seoDescription: textOf(formData, "seoDescription") };

  if (page === "home") {
    data.heroSubtitle = textOf(formData, "heroSubtitle");
    data.primaryButton = textOf(formData, "primaryButton");
    data.secondaryButton = textOf(formData, "secondaryButton");
    data.heroSmallPrint = textOf(formData, "heroSmallPrint");
    return data;
  }

  const header: Record<string, string> = {};
  for (const key of HEADER_KEYS) {
    header[key] = textOf(formData, `header.${key}`);
  }
  data.header = header;

  if (page === "features") {
    const tiles: { eyebrow: string; title: string; text: string }[] = [];
    // Tiles are numbered from 0; the list ends at the first number that isn't there.
    let index = 0;
    while (formData.has(`tiles.${index}.title`)) {
      tiles.push({
        eyebrow: textOf(formData, `tiles.${index}.eyebrow`),
        title: textOf(formData, `tiles.${index}.title`),
        text: textOf(formData, `tiles.${index}.text`),
      });
      index = index + 1;
    }
    data.tiles = tiles;
  }
  return data;
}
