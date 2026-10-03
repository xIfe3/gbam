import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "./logo";

describe("Logo", () => {
  it("is labelled Gbam and has a coral exclamation mark", () => {
    render(<Logo />);
    const logo = screen.getByLabelText("Gbam");
    expect(logo).toBeInTheDocument();
    const bang = logo.querySelector("[data-bang]");
    expect(bang).toHaveTextContent("!");
    expect(bang).toHaveClass("text-coral");
  });

  it("renders the word in white on dark backgrounds", () => {
    render(<Logo variant="on-dark" />);
    const word = screen.getByLabelText("Gbam").querySelector("[data-word]");
    expect(word).toHaveClass("text-white");
  });

  it("renders the word in ink by default", () => {
    render(<Logo />);
    const word = screen.getByLabelText("Gbam").querySelector("[data-word]");
    expect(word).toHaveClass("text-ink");
  });
});
