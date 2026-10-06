import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyLinkButton } from "./copy-link-button";

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

describe("CopyLinkButton", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("copies the link, says Copied on the button itself, then goes back", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<CopyLinkButton url="https://gbam.app/mama-ngozi" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    expect(writeText).toHaveBeenCalledWith("https://gbam.app/mama-ngozi");
    expect(screen.getByRole("button", { name: "✓ Copied" })).toBeInTheDocument();
    // Screen readers still hear the full sentence.
    expect(screen.getByText("Copied! Paste it in WhatsApp.")).toHaveClass("sr-only");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("explains how to copy by hand when the browser blocks it", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("blocked")));
    render(<CopyLinkButton url="https://gbam.app/mama-ngozi" label="Copy product link" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy product link" }));
    });
    expect(screen.getByText("Couldn't copy. Press and hold the link to copy it.")).toBeVisible();
  });
});
