import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPlatformInfo } = vi.hoisted(() => ({ getPlatformInfo: vi.fn() }));
vi.mock("@/lib/platform-info", () => ({ getPlatformInfo }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("./contact-form", () => ({ ContactForm: () => null }));

import ContactPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GBAM_WHATSAPP_NUMBER;
});

describe("contact page", () => {
  it("contact page uses the stored number", async () => {
    getPlatformInfo.mockResolvedValue({ whatsappNumber: "2348099999999" });
    render(await ContactPage());
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute(
      "href",
      "https://wa.me/2348099999999",
    );
  });

  it("falls back to the environment when the API can't be reached", async () => {
    getPlatformInfo.mockResolvedValue(null);
    process.env.GBAM_WHATSAPP_NUMBER = "2348011111111";
    render(await ContactPage());
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute(
      "href",
      "https://wa.me/2348011111111",
    );
  });
});
