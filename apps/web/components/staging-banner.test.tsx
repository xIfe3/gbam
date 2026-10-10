import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StagingBanner } from "./staging-banner";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("StagingBanner", () => {
  it("shows on staging", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    render(<StagingBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("Staging: test copy of Gbam");
  });

  it("nothing on the live site", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    const { container } = render(<StagingBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
