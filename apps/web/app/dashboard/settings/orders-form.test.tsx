import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ updateOrderSettingsAction: vi.fn() }));

import { OrdersForm } from "./orders-form";

describe("OrdersForm", () => {
  it("is unticked by default: customers pay as soon as they order", () => {
    render(<OrdersForm approveOrdersFirst={false} />);
    const box = screen.getByRole("checkbox", { name: /Check each order before the customer pays/ });
    expect(box).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("shows the box ticked for a shop that approves orders first", () => {
    render(<OrdersForm approveOrdersFirst={true} />);
    const box = screen.getByRole("checkbox", { name: /Check each order before the customer pays/ });
    expect(box).toBeChecked();
  });
});
