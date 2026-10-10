import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { visibleNav } from "./admin-nav";
import { BulkActionDialog } from "./bulk-action-dialog";
import { pageHref } from "./list-params";

const ME = {
  id: "a1",
  name: "Chika",
  email: "chika@example.com",
  isSuperadmin: false,
  role: { id: "r1", name: "Support" },
  permissions: ["shops.view", "support.view"] as const,
};

describe("admin navigation", () => {
  it("sidebar shows only permitted items", () => {
    const labels = visibleNav({ ...ME, permissions: [...ME.permissions] }).map(
      (item) => item.label,
    );
    expect(labels).toEqual(["Overview", "Shops", "Support"]);
  });

  it("a superadmin sees everything, including the team pages", () => {
    const labels = visibleNav({ ...ME, isSuperadmin: true, permissions: [] }).map(
      (item) => item.label,
    );
    expect(labels).toEqual([
      "Overview",
      "Shops",
      "Orders",
      "Refunds",
      "Money",
      "Analytics",
      "Support",
      "Tickets",
      "Announcements",
      "Notifications",
      "Audit log",
      "System",
      "Settings",
      "Team",
      "Roles",
      "Sessions",
      "Maintenance",
    ]);
  });

  it("nav shows Money and Analytics by permission", () => {
    const money = visibleNav({ isSuperadmin: false, permissions: ["money.view"] });
    expect(money.map((item) => item.label)).toEqual(["Overview", "Money"]);
    const analytics = visibleNav({ isSuperadmin: false, permissions: ["analytics.view"] });
    expect(analytics.map((item) => item.label)).toEqual(["Overview", "Analytics"]);
  });

  it("nav shows Tickets by permission", () => {
    const tickets = visibleNav({ isSuperadmin: false, permissions: ["tickets.view"] });
    expect(tickets.map((item) => item.label)).toEqual(["Overview", "Tickets"]);
  });

  it("nav shows Announcements and Notifications by permission", () => {
    const messaging = visibleNav({ isSuperadmin: false, permissions: ["messages.send"] });
    expect(messaging.map((item) => item.label)).toEqual([
      "Overview",
      "Announcements",
      "Notifications",
    ]);
  });

  it("nav shows System by permission", () => {
    const system = visibleNav({ isSuperadmin: false, permissions: ["system.view"] });
    expect(system.map((item) => item.label)).toEqual(["Overview", "System"]);
  });
});

describe("settings menu item", () => {
  it("nav shows Settings only with settings.manage", () => {
    const without = visibleNav({ isSuperadmin: false, permissions: ["shops.view"] });
    expect(without.map((item) => item.label)).not.toContain("Settings");
    const withIt = visibleNav({ isSuperadmin: false, permissions: ["settings.manage"] });
    expect(withIt.map((item) => item.label)).toContain("Settings");
    expect(withIt.map((item) => item.label)).not.toContain("Maintenance");
  });
});

describe("list filters in the URL", () => {
  it("filters update the URL and paging keeps them", () => {
    expect(pageHref("/admin/shops", { q: "ada", status: "suspended" }, 3)).toBe(
      "/admin/shops?q=ada&status=suspended&page=3",
    );
    // Empty filters are left out.
    expect(pageHref("/admin/shops", { q: "", status: undefined }, 1)).toBe("/admin/shops?page=1");
  });
});

describe("BulkActionDialog", () => {
  it("bulk dialog needs a note", async () => {
    const run = vi.fn(async () => ({ done: ["1"], skipped: [] }));
    render(
      <BulkActionDialog
        label="Suspend"
        ids={["1"]}
        explanation="Customers won't be able to order from these shops."
        run={run}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Suspend (1)" }));
    const confirm = screen.getByRole("button", { name: "Suspend 1" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Note (for the audit log)" }), {
      target: { value: "Spam wave" },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(run).toHaveBeenCalledWith(["1"], "Spam wave"));
    expect(await screen.findByText("1 done.")).toBeInTheDocument();
  });

  it("risky bulk needs the count typed", () => {
    render(
      <BulkActionDialog
        label="Sign out"
        ids={["1", "2", "3"]}
        explanation="They will have to sign in again."
        risky
        run={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out (3)" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note (for the audit log)" }), {
      target: { value: "Lost laptop" },
    });
    const confirm = screen.getByRole("button", { name: "Sign out 3" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Type 3 to confirm" }), {
      target: { value: "3" },
    });
    expect(confirm).toBeEnabled();
  });

  it("reports what was skipped and why", async () => {
    const run = vi.fn(async () => ({
      done: ["1"],
      skipped: [{ id: "2", why: "Already suspended" }],
    }));
    render(<BulkActionDialog label="Suspend" ids={["1", "2"]} explanation="x" run={run} />);
    fireEvent.click(screen.getByRole("button", { name: "Suspend (2)" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note (for the audit log)" }), {
      target: { value: "Spam wave" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suspend 2" }));
    expect(await screen.findByText("1 done, 1 skipped (Already suspended).")).toBeInTheDocument();
  });

  it("is hidden when nothing is selected", () => {
    render(<BulkActionDialog label="Suspend" ids={[]} explanation="x" run={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
