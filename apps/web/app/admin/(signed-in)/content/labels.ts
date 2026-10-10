import { CONTENT_TYPE_LABELS, type ContentStatus } from "@gbam/shared";

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
};

/** "Help article", "Legal page"... (marketing pages have their own name). */
export function typeLabel(type: string): string {
  if (type === "marketing_page") {
    return "Marketing page";
  }
  for (const [key, label] of Object.entries(CONTENT_TYPE_LABELS)) {
    if (key === type) {
      return label;
    }
  }
  return type;
}
