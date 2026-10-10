import { describe, expect, it } from "vitest";
import {
  MARKETING_DEFAULTS,
  MARKETING_PAGES,
  MARKETING_SCHEMAS,
  resolveMarketing,
} from "./marketing";

describe("marketing page fields", () => {
  it("every page's defaults pass its own schema", () => {
    for (const page of MARKETING_PAGES) {
      expect(MARKETING_SCHEMAS[page].safeParse(MARKETING_DEFAULTS[page]).success).toBe(true);
    }
  });

  it("defaults until something is saved", () => {
    expect(resolveMarketing("about", null)).toEqual(MARKETING_DEFAULTS.about);
  });

  it("saved fields are used", () => {
    const header = { ...MARKETING_DEFAULTS.about.header, title: "Why we built Gbam" };
    expect(resolveMarketing("about", { header }).header.title).toBe("Why we built Gbam");
  });

  it("bad saved fields fall back, field by field", () => {
    const fields = resolveMarketing("home", {
      heroSubtitle: "Sell more on WhatsApp.",
      primaryButton: "",
      secondaryButton: 42,
    });
    expect(fields.heroSubtitle).toBe("Sell more on WhatsApp.");
    expect(fields.primaryButton).toBe(MARKETING_DEFAULTS.home.primaryButton);
    expect(fields.secondaryButton).toBe(MARKETING_DEFAULTS.home.secondaryButton);
  });

  it("a photo is one of ours or an https address", () => {
    const header = { ...MARKETING_DEFAULTS.mission.header, photoSrc: "javascript:alert(1)" };
    expect(resolveMarketing("mission", { header }).header.photoSrc).toBe(
      MARKETING_DEFAULTS.mission.header.photoSrc,
    );
  });
});
