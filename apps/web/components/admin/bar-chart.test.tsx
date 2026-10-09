import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart } from "./bar-chart";

const POINTS = [
  { day: "2026-10-01", value: 150_000 },
  { day: "2026-10-02", value: 0 },
  { day: "2026-10-03", value: 450_000 },
];

describe("BarChart", () => {
  it("bar chart labels each day and has a text summary", () => {
    render(<BarChart title="Sales per day" points={POINTS} unit="naira" />);
    const figure = screen.getByRole("figure", { name: "Sales per day" });
    // A summary in words, for screen readers and anyone skimming.
    expect(figure).toHaveTextContent("Highest: ₦4,500 on 3 Oct");
    expect(figure).toHaveTextContent("Total: ₦6,000 over 3 days");
    // Every day is in the table view, with its value.
    const table = within(figure).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(table).toHaveTextContent("2 Oct₦0");
    // One bar per day, each named for assistive tech.
    expect(within(figure).getByLabelText("3 Oct: ₦4,500")).toBeInTheDocument();
  });

  it("shows a tooltip on hover", () => {
    render(<BarChart title="Visits" points={POINTS} unit="count" />);
    fireEvent.pointerEnter(screen.getByLabelText("1 Oct: 150,000"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("150,0001 Oct");
  });

  it("says so when there's nothing yet", () => {
    render(
      <BarChart title="Sales per day" points={[{ day: "2026-10-01", value: 0 }]} unit="naira" />,
    );
    expect(screen.getByText("Nothing in this range yet.")).toBeInTheDocument();
  });
});
