import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FilterBar } from "./list-bits";

function renderBar() {
  return render(
    <FilterBar>
      <label>
        Status
        <select name="status">
          <option value="">Any</option>
        </select>
      </label>
    </FilterBar>,
  );
}

describe("FilterBar on phones", () => {
  it("a Filters button opens the filters as a bottom sheet", () => {
    renderBar();
    const open = screen.getByRole("button", { name: "Filters" });
    expect(open).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(open);
    expect(open).toHaveAttribute("aria-expanded", "true");
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(sheet).toHaveTextContent("Status");
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute("href", "?");
  });

  it("closes with ✕, Escape, or a tap outside", async () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
