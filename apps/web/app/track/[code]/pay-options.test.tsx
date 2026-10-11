import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../actions", () => ({ payNowAction: vi.fn(), directPayAction: vi.fn() }));
vi.mock("@/lib/paystack-popup", () => ({ openPaystackPopup: vi.fn() }));

import { directPayAction } from "../actions";
import { PayOptions } from "./pay-options";

const KEY = "secret-key-abcdefghijklmnop";
const IN_30_MINUTES = new Date(Date.now() + 30 * 60_000).toISOString();

const TRANSFER = {
  method: "bank_transfer" as const,
  reference: "gbam_GB-7B2Q_9f2c41ab",
  amountKobo: 1000000,
  expiresAt: IN_30_MINUTES,
  bankName: "Wema Bank",
  accountNumber: "1260367879",
  accountName: "PAYSTACK CHECKOUT",
};

function show() {
  render(<PayOptions code="GB-7B2Q" trackingKey={KEY} totalKobo={1000000} />);
}

async function tap(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("PayOptions", () => {
  beforeEach(() => {
    vi.mocked(directPayAction).mockReset();
    push.mockReset();
  });

  it("offers transfer, USSD and card, with transfer picked first", () => {
    show();
    expect(screen.getByRole("radio", { name: "Bank transfer" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "USSD" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Card" })).not.toBeChecked();
  });

  it("transfer: shows the account to pay into, then waits for the money", async () => {
    vi.mocked(directPayAction).mockResolvedValue({ payment: TRANSFER });
    show();
    await tap("Get account details");

    expect(directPayAction).toHaveBeenCalledWith("GB-7B2Q", KEY, { method: "bank_transfer" });
    expect(screen.getByText("1260367879")).toBeInTheDocument();
    expect(screen.getByText("Wema Bank")).toBeInTheDocument();
    expect(screen.getByText("PAYSTACK CHECKOUT")).toBeInTheDocument();
    expect(screen.getByText("₦10,000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy account number" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy amount" })).toBeInTheDocument();
    expect(screen.getByText(/Expires in \d+:\d\d/)).toBeInTheDocument();

    await tap("I've sent the money");
    expect(push).toHaveBeenCalledWith(`/track/GB-7B2Q?k=${KEY}&paid=1`);
  });

  it("an account that has run out offers a fresh one", async () => {
    vi.mocked(directPayAction).mockResolvedValue({
      payment: { ...TRANSFER, expiresAt: new Date(Date.now() - 1000).toISOString() },
    });
    show();
    await tap("Get account details");
    expect(screen.getByText(/This account has expired/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I've sent the money" })).toBeNull();
    expect(screen.getByRole("button", { name: "Get a new account" })).toBeInTheDocument();
    // Someone who sent the money just before it ran out mustn't be pushed to pay again.
    await tap("I already sent the money");
    expect(push).toHaveBeenCalledWith(`/track/GB-7B2Q?k=${KEY}&paid=1`);
  });

  it("an old USSD code: a new one is offered, without claiming the old can't take money", async () => {
    vi.mocked(directPayAction).mockResolvedValue({
      payment: {
        method: "ussd",
        reference: "gbam_GB-7B2Q_1a2b3c4d",
        amountKobo: 1000000,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        bank: "737",
        ussdCode: "*737*33*4*26945#",
      },
    });
    show();
    fireEvent.click(screen.getByRole("radio", { name: "USSD" }));
    await tap("Get USSD code");
    expect(screen.getByText(/This code may have stopped working/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get a new code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I already paid" })).toBeInTheDocument();
  });

  it("USSD: pick your bank, get the code, and dial it with one tap", async () => {
    vi.mocked(directPayAction).mockResolvedValue({
      payment: {
        method: "ussd",
        reference: "gbam_GB-7B2Q_1a2b3c4d",
        amountKobo: 1000000,
        expiresAt: IN_30_MINUTES,
        bank: "966",
        ussdCode: "*966*6*7297*11441#",
      },
    });
    show();
    fireEvent.click(screen.getByRole("radio", { name: "USSD" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Your bank" }), {
      target: { value: "966" },
    });
    await tap("Get USSD code");

    expect(directPayAction).toHaveBeenCalledWith("GB-7B2Q", KEY, { method: "ussd", bank: "966" });
    expect(screen.getByText("*966*6*7297*11441#")).toBeInTheDocument();
    // "#" has to be written %23 in a phone link, or the phone drops it.
    expect(screen.getByRole("link", { name: "Dial now" })).toHaveAttribute(
      "href",
      "tel:*966*6*7297*11441%23",
    );
    await tap("I've dialled and paid");
    expect(push).toHaveBeenCalledWith(`/track/GB-7B2Q?k=${KEY}&paid=1`);
  });

  it("card: Paystack's secure pop-up", () => {
    show();
    fireEvent.click(screen.getByRole("radio", { name: "Card" }));
    expect(screen.getByRole("button", { name: "Pay ₦10,000 by card" })).toBeInTheDocument();
    expect(directPayAction).not.toHaveBeenCalled();
  });

  it("too little time left: says so and points to card", async () => {
    vi.mocked(directPayAction).mockResolvedValue({
      error: "There isn't enough time left to pay by transfer or USSD. Pay by card instead.",
      useCard: true,
    });
    show();
    await tap("Get account details");
    expect(screen.getByRole("alert")).toHaveTextContent("isn't enough time left");
    await tap("Pay by card instead");
    expect(screen.getByRole("radio", { name: "Card" })).toBeChecked();
  });

  it("if Paystack can't set it up, Paystack's own window is offered instead", async () => {
    vi.mocked(directPayAction).mockResolvedValue({
      error: "We couldn't set that up just now.",
      useCheckout: true,
    });
    show();
    await tap("Get account details");
    expect(screen.getByRole("alert")).toHaveTextContent("couldn't set that up");
    expect(screen.getByRole("button", { name: "Pay ₦10,000 with Paystack" })).toBeInTheDocument();
  });
});
