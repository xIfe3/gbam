import { fireEvent, render, screen } from "@testing-library/react";
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
    vi.restoreAllMocks();
  });

  it("copies the link and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<CopyLinkButton url="https://gbam.app/mama-ngozi" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy shop link" }));

    expect(await screen.findByText("Copied! Paste it in WhatsApp.")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith("https://gbam.app/mama-ngozi");
  });

  it("tells the seller what to do when copying fails", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("blocked")));
    render(<CopyLinkButton url="https://gbam.app/mama-ngozi" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy shop link" }));

    expect(
      await screen.findByText("Couldn't copy. Press and hold the link above to copy it."),
    ).toBeInTheDocument();
  });
});
