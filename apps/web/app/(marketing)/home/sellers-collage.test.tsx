import { existsSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SellersCollage } from "./sellers-collage";

// apps/web/public, where /images/... is served from. Tests run from apps/web.
const PUBLIC_DIR = path.join(process.cwd(), "public");

describe("SellersCollage", () => {
  it("shows a real photo with alt text for each kind of seller, and every file exists", () => {
    render(<SellersCollage />);
    const photos = screen.getAllByRole("img");
    expect(photos).toHaveLength(6);
    for (const photo of photos) {
      expect(photo.tagName).toBe("IMG");
      expect(photo.getAttribute("alt")).not.toBe("");
      const src = photo.getAttribute("src");
      if (src === null) {
        throw new Error("A collage photo has no src");
      }
      expect(existsSync(path.join(PUBLIC_DIR, src))).toBe(true);
    }
  });
});
