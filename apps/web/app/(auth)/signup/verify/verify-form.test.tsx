import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The real actions need the server; the form only needs something to point at.
vi.mock("../actions", () => ({ verifyEmailAction: vi.fn(), resendCodeAction: vi.fn() }));
vi.mock("../../actions", () => ({ logoutAction: vi.fn() }));

import { VerifyForm } from "./verify-form";

describe("VerifyForm", () => {
  it("offers Resend code and a way to log out or use a different email", () => {
    render(<VerifyForm email="a@b.co" />);
    expect(screen.getByRole("button", { name: "Resend code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });
});
