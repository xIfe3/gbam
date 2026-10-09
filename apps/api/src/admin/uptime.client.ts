import { Inject, Injectable } from "@nestjs/common";
import { ENV, type Env } from "../env.js";

export type UptimeMonitor = {
  name: string;
  status: "up" | "down" | "paused" | "unknown";
  /** Percent of the last 30 days it was up, e.g. 99.98; null if UptimeRobot didn't say. */
  uptime30d: number | null;
};

export type UptimeResult =
  | { state: "not_configured" }
  | { state: "unavailable" }
  | { state: "ok"; monitors: UptimeMonitor[] };

const API_URL = "https://api.uptimerobot.com/v2/getMonitors";
const CACHE_MS = 60_000;
const TIMEOUT_MS = 5_000;

/** UptimeRobot's status numbers: 0 paused, 1 not checked yet, 2 up, 8 seems down, 9 down. */
function statusName(code: unknown): UptimeMonitor["status"] {
  if (code === 2) {
    return "up";
  }
  if (code === 8 || code === 9) {
    return "down";
  }
  if (code === 0) {
    return "paused";
  }
  return "unknown";
}

/**
 * Current status and 30-day uptime from UptimeRobot, for the admin System page. UptimeRobot
 * itself checks the site every minute and alerts the owner; this only shows its numbers.
 */
@Injectable()
export class UptimeClient {
  private cached: { at: number; result: UptimeResult } | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async monitors(): Promise<UptimeResult> {
    const apiKey = this.env.UPTIME_API_KEY;
    if (!apiKey) {
      return { state: "not_configured" };
    }
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) {
      return this.cached.result;
    }

    // UptimeRobot's API takes a form-encoded POST, even for reading.
    const form = new URLSearchParams({
      api_key: apiKey,
      format: "json",
      custom_uptime_ratios: "30",
    });
    let body: unknown;
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        return { state: "unavailable" };
      }
      body = await res.json();
    } catch {
      return { state: "unavailable" };
    }
    if (typeof body !== "object" || body === null) {
      return { state: "unavailable" };
    }
    const answer = body as { stat?: unknown; monitors?: unknown };
    if (answer.stat !== "ok" || !Array.isArray(answer.monitors)) {
      return { state: "unavailable" };
    }

    const monitors: UptimeMonitor[] = [];
    for (const item of answer.monitors) {
      if (typeof item !== "object" || item === null) {
        continue;
      }
      const monitor = item as Record<string, unknown>;
      let uptime30d: number | null = null;
      const ratio = Number(monitor.custom_uptime_ratio);
      if (monitor.custom_uptime_ratio !== undefined && !Number.isNaN(ratio)) {
        uptime30d = ratio;
      }
      let name = "";
      if (typeof monitor.friendly_name === "string") {
        name = monitor.friendly_name;
      }
      monitors.push({ name, status: statusName(monitor.status), uptime30d });
    }
    const result: UptimeResult = { state: "ok", monitors };
    this.cached = { at: Date.now(), result };
    return result;
  }
}
