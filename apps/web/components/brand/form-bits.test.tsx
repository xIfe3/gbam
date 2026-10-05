import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PendingButton } from "./form-bits";

describe("PendingButton", () => {
  it("shows its pending label and can't be tapped twice while the form is sending", async () => {
    let finish: () => void = () => {};
    // A form action that stays "in flight" until the test lets it finish.
    async function slowAction() {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    }
    render(
      <form action={slowAction}>
        <PendingButton pendingLabel="Logging out…" className="x">
          Log out
        </PendingButton>
      </form>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    });
    const button = screen.getByRole("button", { name: "Logging out…" });
    expect(button).toBeDisabled();

    await act(async () => {
      finish();
    });
    expect(screen.getByRole("button", { name: "Log out" })).toBeEnabled();
  });
});
