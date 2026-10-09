import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../env.js";
import { SentryIssuesClient } from "./sentry-issues.client.js";
import { UptimeClient } from "./uptime.client.js";

const BASE_ENV = { DATABASE_URL: "postgres://u:p@localhost/db", REDIS_URL: "redis://localhost" };

const SENTRY_ENV = loadEnv({
  ...BASE_ENV,
  SENTRY_AUTH_TOKEN: "sntrys_test",
  SENTRY_ORG: "zephra",
  SENTRY_PROJECT: "gbam-api",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("SentryIssuesClient", () => {
  it("sentry not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new SentryIssuesClient(loadEnv(BASE_ENV));
    expect(await client.latest()).toEqual({ state: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sentry issues mapped and scrubbed", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse([
        {
          id: "42",
          title: "Error: no seller for ada@example.com",
          culprit: "OrdersService.create",
          count: "17",
          lastSeen: "2026-10-09T08:00:00Z",
          permalink: "https://zephra.sentry.io/issues/42/",
          metadata: { secret: "never shown" },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new SentryIssuesClient(SENTRY_ENV);
    const result = await client.latest();
    expect(result).toEqual({
      state: "ok",
      issues: [
        {
          id: "42",
          title: "Error: no seller for [email]",
          culprit: "OrdersService.create",
          count: 17,
          lastSeen: "2026-10-09T08:00:00Z",
          link: "https://zephra.sentry.io/issues/42/",
        },
      ],
    });
    const call = fetchMock.mock.calls[0];
    if (!call) {
      throw new Error("fetch was not called");
    }
    expect(call[0]).toBe(
      "https://sentry.io/api/0/projects/zephra/gbam-api/issues/?query=is%3Aunresolved&limit=10",
    );
    expect(new Headers(call[1].headers).get("authorization")).toBe("Bearer sntrys_test");
    // A second look within a minute uses the saved answer.
    await client.latest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a link that isn't https is dropped (it's shown as a link to admins)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([{ id: "1", title: "x", count: "1", permalink: "javascript:alert(1)" }]),
      ),
    );
    const result = await new SentryIssuesClient(SENTRY_ENV).latest();
    if (result.state !== "ok") {
      throw new Error(`expected ok, got ${result.state}`);
    }
    expect(result.issues[0]?.link).toBe("");
  });

  it("sentry unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "nope" }, 401)),
    );
    expect(await new SentryIssuesClient(SENTRY_ENV).latest()).toEqual({ state: "unavailable" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    expect(await new SentryIssuesClient(SENTRY_ENV).latest()).toEqual({ state: "unavailable" });
  });
});

describe("UptimeClient", () => {
  const UPTIME_ENV = loadEnv({ ...BASE_ENV, UPTIME_API_KEY: "ur-key" });

  it("uptime not configured", async () => {
    expect(await new UptimeClient(loadEnv(BASE_ENV)).monitors()).toEqual({
      state: "not_configured",
    });
  });

  it("uptime monitors mapped", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({
        stat: "ok",
        monitors: [
          { friendly_name: "Website", status: 2, custom_uptime_ratio: "99.982" },
          { friendly_name: "API", status: 9, custom_uptime_ratio: "97.5" },
          { friendly_name: "Old", status: 0 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await new UptimeClient(UPTIME_ENV).monitors()).toEqual({
      state: "ok",
      monitors: [
        { name: "Website", status: "up", uptime30d: 99.982 },
        { name: "API", status: "down", uptime30d: 97.5 },
        { name: "Old", status: "paused", uptime30d: null },
      ],
    });
    const call = fetchMock.mock.calls[0];
    if (!call) {
      throw new Error("fetch was not called");
    }
    expect(call[0]).toBe("https://api.uptimerobot.com/v2/getMonitors");
    const sent = new URLSearchParams(String(call[1].body));
    expect(sent.get("api_key")).toBe("ur-key");
    expect(sent.get("custom_uptime_ratios")).toBe("30");
  });

  it("uptime unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ stat: "fail", error: { message: "bad key" } })),
    );
    expect(await new UptimeClient(UPTIME_ENV).monitors()).toEqual({ state: "unavailable" });
  });
});
