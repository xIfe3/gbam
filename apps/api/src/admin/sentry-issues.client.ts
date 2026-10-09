import { scrubText } from "@gbam/shared";
import { Inject, Injectable } from "@nestjs/common";
import { ENV, type Env } from "../env.js";

export type SentryIssue = {
  id: string;
  title: string;
  culprit: string;
  count: number;
  lastSeen: string;
  link: string;
};

export type SentryResult =
  { state: "not_configured" } | { state: "unavailable" } | { state: "ok"; issues: SentryIssue[] };

/** Reuse a good answer for a minute, so reloading the System page doesn't hammer Sentry. */
const CACHE_MS = 60_000;
const TIMEOUT_MS = 5_000;
const DEFAULT_API_URL = "https://sentry.io";

function text(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return "";
}

/** Only https links: the page shows this as a link, and "javascript:..." must never be one. */
function httpsLink(value: unknown): string {
  const link = text(value);
  if (link.startsWith("https://")) {
    return link;
  }
  return "";
}

/**
 * The latest unresolved errors from Sentry's API, for the admin System page. Only titles,
 * counts and links are kept; titles are scrubbed again in case one holds an email or phone.
 */
@Injectable()
export class SentryIssuesClient {
  private cached: { at: number; result: SentryResult } | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async latest(): Promise<SentryResult> {
    const token = this.env.SENTRY_AUTH_TOKEN;
    const org = this.env.SENTRY_ORG;
    const project = this.env.SENTRY_PROJECT;
    if (!token || !org || !project) {
      return { state: "not_configured" };
    }
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) {
      return this.cached.result;
    }

    let apiUrl = DEFAULT_API_URL;
    if (this.env.SENTRY_API_URL) {
      apiUrl = this.env.SENTRY_API_URL;
    }
    const query = new URLSearchParams({ query: "is:unresolved", limit: "10" });
    const url = `${apiUrl}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?${query.toString()}`;

    let body: unknown;
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        return { state: "unavailable" };
      }
      body = await res.json();
    } catch {
      // Sentry slow or unreachable: the page says so and carries on.
      return { state: "unavailable" };
    }
    if (!Array.isArray(body)) {
      return { state: "unavailable" };
    }

    const issues: SentryIssue[] = [];
    for (const item of body) {
      if (typeof item !== "object" || item === null) {
        continue;
      }
      const issue = item as Record<string, unknown>;
      issues.push({
        id: text(issue.id),
        title: scrubText(text(issue.title)),
        culprit: scrubText(text(issue.culprit)),
        count: Number(issue.count),
        lastSeen: text(issue.lastSeen),
        link: httpsLink(issue.permalink),
      });
    }
    const result: SentryResult = { state: "ok", issues };
    this.cached = { at: Date.now(), result };
    return result;
  }
}
