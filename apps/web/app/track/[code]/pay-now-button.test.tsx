import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../actions", () => ({ payNowAction: vi.fn() }));
vi.mock("@/lib/paystack-popup", () => ({ openPaystackPopup: vi.fn() }));

import { openPaystackPopup } from "@/lib/paystack-popup";
import { payNowAction } from "../actions";
import { PayNowButton } from "./pay-now-button";

const KEY = "secret-key-abcdefghijklmnop";

describe("PayNowButton", () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.mocked(payNowAction).mockReset();
    vi.mocked(openPaystackPopup).mockReset();
    push.mockReset();
    assign.mockReset();
    // jsdom can't navigate; record where we'd have gone instead.
    vi.stubGlobal("location", { ...window.location, assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function press() {
    render(<PayNowButton code="GB-7B2Q" trackingKey={KEY} totalKobo={1000000} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pay ₦10,000 securely" }));
    });
  }

  it("opens Paystack's pop-up, then goes to the tracking page to wait for confirmation", async () => {
    vi.mocked(payNowAction).mockResolvedValue({
      url: "https://checkout.paystack.com/abc123",
      accessCode: "abc123",
    });
    vi.mocked(openPaystackPopup).mockResolvedValue("paid");

    await press();

    expect(openPaystackPopup).toHaveBeenCalledWith("abc123");
    expect(push).toHaveBeenCalledWith(`/track/GB-7B2Q?k=${KEY}&paid=1`);
    expect(assign).not.toHaveBeenCalled();
  });

  it("stays on the page when the pop-up is closed without paying", async () => {
    vi.mocked(payNowAction).mockResolvedValue({
      url: "https://checkout.paystack.com/abc123",
      accessCode: "abc123",
    });
    vi.mocked(openPaystackPopup).mockResolvedValue("closed");

    await press();

    expect(push).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pay ₦10,000 securely" })).toBeEnabled();
  });

  it("falls back to Paystack's own page when the pop-up can't open", async () => {
    vi.mocked(payNowAction).mockResolvedValue({
      url: "https://checkout.paystack.com/abc123",
      accessCode: "abc123",
    });
    vi.mocked(openPaystackPopup).mockRejectedValue(new Error("blocked"));

    await press();

    expect(assign).toHaveBeenCalledWith("https://checkout.paystack.com/abc123");
  });

  it("uses Paystack's page directly when there is no access code", async () => {
    vi.mocked(payNowAction).mockResolvedValue({ url: "https://pay.test/x", accessCode: null });

    await press();

    expect(openPaystackPopup).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("https://pay.test/x");
  });

  it("shows the message when the order can't be paid any more", async () => {
    vi.mocked(payNowAction).mockResolvedValue({ error: "This order isn't waiting for payment" });

    await press();

    expect(screen.getByRole("alert")).toHaveTextContent("isn't waiting for payment");
  });
});
