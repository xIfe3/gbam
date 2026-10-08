import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrderTotals } from "./order-totals";

describe("OrderTotals", () => {
  it("shows items, delivery and total", () => {
    render(
      <OrderTotals
        subtotalKobo={1200000}
        deliveryFeeKobo={250000}
        deliveryLabel="Lekki / VI"
        totalKobo={1450000}
      />,
    );
    expect(screen.getByText("Items").nextSibling).toHaveTextContent("₦12,000");
    expect(screen.getByText("Delivery (Lekki / VI)").nextSibling).toHaveTextContent("₦2,500");
    expect(screen.getByText("Total").nextSibling).toHaveTextContent("₦14,500");
  });

  it("free delivery says Free", () => {
    render(
      <OrderTotals
        subtotalKobo={1200000}
        deliveryFeeKobo={0}
        deliveryLabel="Pickup from shop"
        totalKobo={1200000}
      />,
    );
    expect(screen.getByText("Delivery (Pickup from shop)").nextSibling).toHaveTextContent("Free");
  });

  it("old order without delivery shows only the total", () => {
    // Orders placed before delivery existed have no subtotal or delivery fields at all.
    render(<OrderTotals deliveryLabel={undefined} totalKobo={1000000} />);
    expect(screen.queryByText("Items")).not.toBeInTheDocument();
    expect(screen.queryByText(/Delivery/)).not.toBeInTheDocument();
    expect(screen.getByText("Total").nextSibling).toHaveTextContent("₦10,000");
  });
});
