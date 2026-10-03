import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Prose } from "./prose";

describe("Prose", () => {
  it("renders markdown and drops raw HTML", () => {
    const { container } = render(
      <Prose markdown={"# Hi\n\n<script>alert(1)</script>\n\n**bold**"} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Hi" })).toBeInTheDocument();
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).not.toContain("alert(1)");
  });
});
