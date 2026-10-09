import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { adminApiMock } = vi.hoisted(() => ({
  adminApiMock: { me: vi.fn(), system: vi.fn(), failedJobs: vi.fn() },
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
// The page only hands this action to buttons; it never runs in these tests.
vi.mock("./admin-actions", () => ({ retryJobAction: vi.fn() }));

import SystemPage from "./system/page";

function me(permissions: string[]) {
  return {
    id: "a1",
    name: "Chika",
    email: "c@x.com",
    isSuperadmin: false,
    role: null,
    permissions,
  };
}

const OVERVIEW = {
  status: {
    database: { ok: true, ms: 3 },
    redis: { ok: false, ms: 5000 },
    worker: { state: "late", lastBeatAt: "2026-10-09T07:00:00Z" },
  },
  queues: [
    { name: "emails", counts: { waiting: 2, active: 0, failed: 3, delayed: 1 } },
    { name: "payments", counts: null },
  ],
  errors: {
    state: "ok",
    issues: [
      {
        id: "42",
        title: "TypeError: x is undefined",
        culprit: "OrdersService.create",
        count: 17,
        lastSeen: "2026-10-09T08:00:00Z",
        link: "https://zephra.sentry.io/issues/42/",
      },
    ],
  },
  uptime: {
    state: "ok",
    monitors: [{ name: "Website", status: "up", uptime30d: 99.982 }],
  },
};

const FAILED = [
  {
    id: "7",
    name: "send-code",
    error: "Resend refused [email]",
    attempts: 3,
    failedAt: "2026-10-09T06:00:00Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  adminApiMock.system.mockResolvedValue(OVERVIEW);
  adminApiMock.failedJobs.mockResolvedValue(FAILED);
});

describe("System page", () => {
  it("system page shows status, errors, queues and uptime", async () => {
    adminApiMock.me.mockResolvedValue(me(["system.view"]));
    render(await SystemPage({ searchParams: Promise.resolve({}) }));
    const status = screen.getByRole("list", { name: "Status" });
    expect(within(status).getByText("Database").parentElement).toHaveTextContent("Working");
    expect(within(status).getByText("Redis").parentElement).toHaveTextContent("Not answering");
    expect(within(status).getByText("Worker").parentElement).toHaveTextContent("Late");
    expect(screen.getByRole("link", { name: "TypeError: x is undefined" })).toHaveAttribute(
      "href",
      "https://zephra.sentry.io/issues/42/",
    );
    const queues = screen.getByRole("table", { name: "Background jobs" });
    const emails = within(queues).getByRole("row", { name: /emails/ });
    expect(emails).toHaveTextContent("3");
    expect(within(emails).getByRole("link", { name: "See failed" })).toHaveAttribute(
      "href",
      "/admin/system?queue=emails",
    );
    expect(within(queues).getByRole("row", { name: /payments/ })).toHaveTextContent(
      "Couldn't count",
    );
    expect(screen.getByText("Website").parentElement).toHaveTextContent("99.98%");
  });

  it("not set up panels explain what to add", async () => {
    adminApiMock.me.mockResolvedValue(me(["system.view"]));
    adminApiMock.system.mockResolvedValue({
      ...OVERVIEW,
      errors: { state: "not_configured" },
      uptime: { state: "unavailable" },
    });
    render(await SystemPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText(/SENTRY_AUTH_TOKEN/)).toBeInTheDocument();
    expect(screen.getByText(/Couldn't reach UptimeRobot/)).toBeInTheDocument();
  });

  it("failed jobs list with retry only for system.manage", async () => {
    adminApiMock.me.mockResolvedValue(me(["system.view"]));
    render(await SystemPage({ searchParams: Promise.resolve({ queue: "emails" }) }));
    expect(adminApiMock.failedJobs).toHaveBeenCalledWith("emails");
    const list = screen.getByRole("table", { name: "Failed jobs in emails" });
    expect(list).toHaveTextContent("Resend refused [email]");
    expect(within(list).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("an admin with system.manage gets a Retry button", async () => {
    adminApiMock.me.mockResolvedValue(me(["system.view", "system.manage"]));
    render(await SystemPage({ searchParams: Promise.resolve({ queue: "emails" }) }));
    const list = screen.getByRole("table", { name: "Failed jobs in emails" });
    expect(within(list).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
