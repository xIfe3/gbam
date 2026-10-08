import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPlatformInfo } = vi.hoisted(() => ({ getPlatformInfo: vi.fn() }));
vi.mock("@/lib/platform-info", () => ({ getPlatformInfo }));
vi.mock("../guard", () => ({ redirectIfSignedIn: async () => undefined }));
vi.mock("./signup-form", () => ({ SignupForm: () => <form aria-label="Sign up" /> }));

import SignupPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signup page", () => {
  it("shows a notice instead of the form while sign-ups are paused", async () => {
    getPlatformInfo.mockResolvedValue({ signupsOpen: false });
    render(await SignupPage());
    expect(screen.getByText(/New sign-ups are paused/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Sign up" })).toBeNull();
  });

  it("shows the form normally (and if the status can't be loaded)", async () => {
    getPlatformInfo.mockResolvedValue(null);
    render(await SignupPage());
    expect(screen.getByRole("form", { name: "Sign up" })).toBeInTheDocument();
  });
});
