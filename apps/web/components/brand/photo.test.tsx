import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Photo } from "./photo";

describe("Photo", () => {
  it("shows a labelled placeholder with the description when there is no src", () => {
    render(<Photo description="food vendor at her stall" />);
    expect(screen.getByText("food vendor at her stall")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "food vendor at her stall" })).toBeInTheDocument();
  });

  it("renders an img with alt when src is given", () => {
    render(<Photo description="food vendor at her stall" src="/photos/a.jpg" alt="A vendor" />);
    expect(screen.getByRole("img", { name: "A vendor" })).toHaveAttribute("src", "/photos/a.jpg");
  });
});
