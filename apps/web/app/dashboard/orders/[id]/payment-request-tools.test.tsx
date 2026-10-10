import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { resend } = vi.hoisted(() => ({
  resend: vi.fn(async () => ({ notice: "Sent again on WhatsApp." })),
}));
vi.mock("../../actions", () => ({ resendPaymentAction: resend }));

import { PaymentRequestTools } from "./payment-request-tools";

describe("PaymentRequestTools", () => {
  it("resend the request, or copy the pay link", async () => {
    render(<PaymentRequestTools orderId="o1" payLink="https://gbam.app/pay/GB-7K3Q?k=abc" />);
    expect(screen.getByRole("button", { name: "Copy payment link" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resend payment request" }));
    });
    expect(resend).toHaveBeenCalledWith("o1");
    expect(screen.getByText("Sent again on WhatsApp.")).toBeInTheDocument();
  });
});
