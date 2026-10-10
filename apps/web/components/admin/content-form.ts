import type { ContentDraft } from "@gbam/shared";

function textOf(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value === "string") {
    return value;
  }
  return "";
}

/** "" (an empty box) becomes null, as the API stores "not set". */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed;
}

/**
 * The content editor's fields as a draft. Extra fields (a legal page's sections) arrive as
 * JSON in a hidden "data" input; the API checks them.
 */
export function draftFromForm(formData: FormData): ContentDraft {
  let sortOrder = 0;
  const typedOrder = textOf(formData, "sortOrder").trim();
  if (typedOrder !== "") {
    sortOrder = Number(typedOrder);
  }
  let data: Record<string, unknown> | null = null;
  const rawData = textOf(formData, "data");
  if (rawData !== "") {
    try {
      const parsed: unknown = JSON.parse(rawData);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      // Not JSON (can't happen from our own form): treated as no extra fields.
      data = null;
    }
  }
  return {
    title: textOf(formData, "title"),
    summary: orNull(textOf(formData, "summary")),
    body: textOf(formData, "body"),
    category: orNull(textOf(formData, "category")),
    sortOrder,
    seoDescription: orNull(textOf(formData, "seoDescription")),
    data,
  };
}
