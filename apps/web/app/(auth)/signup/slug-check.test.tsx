import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ checkSlugAction: vi.fn() }));

import type { SlugCheck } from "./actions";
import { SlugField } from "./slug-check";

/** Renders the field with a check that always gives `status`, then waits for the answer. */
async function fieldWith(status: SlugCheck["status"]) {
  const check = async () => ({ status });
  render(<SlugField value="codesavvy" onChange={() => {}} check={check} />);
  const line = screen.getByRole("status");
  await waitFor(() => expect(line).not.toHaveTextContent("Checking"));
  return line;
}

describe("SlugField availability line", () => {
  it("is green with a tick when the link is free", async () => {
    const line = await fieldWith("available");
    expect(line).toHaveTextContent("✓ gbam");
    expect(line).toHaveTextContent("Available");
    expect(line.className).toContain("text-brand-hover");
  });

  it("is red with a cross when the link is taken, so it's seen without looking hard", async () => {
    const line = await fieldWith("taken");
    expect(line).toHaveTextContent("✗");
    expect(line).toHaveTextContent("That link is taken. Try another.");
    expect(line.className).toContain("text-coral-deep");
  });

  it("is red for a reserved or badly typed link too", async () => {
    for (const status of ["reserved", "invalid"] as const) {
      const line = await fieldWith(status);
      expect(line.className).toContain("text-coral-deep");
      line.parentElement?.parentElement?.remove();
    }
  });
});
