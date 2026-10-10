import type { BellData } from "@/lib/api";

type NotificationKind = BellData["items"][number]["type"];

// A plain module (not "use client"), so both the bell and the server-rendered
// notifications pages can call these.

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });
}

/** A small mark per type, so the type never depends on colour alone. */
export function typeMark(type: NotificationKind): string {
  if (type === "warning") {
    return "!";
  }
  if (type === "action") {
    return "→";
  }
  return "i";
}
