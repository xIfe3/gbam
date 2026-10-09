/** A report range: whole Lagos days, "YYYY-MM-DD". Missing = let the API pick (last 30 days). */
export type ReportRange = { from: string | undefined; to: string | undefined };

export type RangePreset = { label: string; from: string; to: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The Lagos date (UTC+1, no daylight saving) of a moment, as "YYYY-MM-DD". */
export function lagosDate(moment: Date): string {
  const inLagos = new Date(moment.getTime() + 60 * 60 * 1000);
  return inLagos.toISOString().slice(0, 10);
}

/** The date `days` days before a "YYYY-MM-DD" date. */
function daysBefore(day: string, days: number): string {
  const noon = new Date(`${day}T12:00:00Z`);
  const earlier = new Date(noon.getTime() - days * DAY_MS);
  return earlier.toISOString().slice(0, 10);
}

/** The quick choices above each report: today, the last 7 days, the last 30 days. */
export function rangePresets(now: Date): RangePreset[] {
  const today = lagosDate(now);
  return [
    { label: "Today", from: today, to: today },
    { label: "7 days", from: daysBefore(today, 6), to: today },
    { label: "30 days", from: daysBefore(today, 29), to: today },
  ];
}

/** The first value of a search param, if it looks like a date. */
function dateParam(value: string | string[] | undefined): string | undefined {
  let first = value;
  if (Array.isArray(value)) {
    first = value[0];
  }
  if (typeof first === "string" && DATE.test(first)) {
    return first;
  }
  return undefined;
}

/** The range in the address bar (?from=&to=). Anything that isn't a date is ignored. */
export function rangeFromParams(
  searchParams: Record<string, string | string[] | undefined>,
): ReportRange {
  return { from: dateParam(searchParams.from), to: dateParam(searchParams.to) };
}

/** "/admin/money?from=…&to=…" */
export function rangeHref(basePath: string, from: string, to: string): string {
  const params = new URLSearchParams({ from, to });
  return `${basePath}?${params.toString()}`;
}

/** "3 Oct" for a "YYYY-MM-DD" date. */
export function shortDay(day: string): string {
  const noon = new Date(`${day}T12:00:00Z`);
  return noon.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
