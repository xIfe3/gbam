import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The real action needs the server; the form only needs something to point at.
vi.mock("./actions", () => ({ saveDeliveryAction: vi.fn() }));

import { DeliveryForm } from "./delivery-form";

const LEKKI = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Lekki / VI",
  feeKobo: 250_000,
  isPickup: false,
};

/** The JSON the form will submit, read from its hidden field. */
function submittedZones(container: HTMLElement): unknown {
  const hidden = container.querySelector<HTMLInputElement>('input[name="zones"]');
  if (!hidden) {
    throw new Error("no zones field");
  }
  return JSON.parse(hidden.value);
}

describe("DeliveryForm", () => {
  it("shows saved zones with their fee in naira", () => {
    render(<DeliveryForm zones={[LEKKI]} pickupNote={null} />);
    expect(screen.getByRole("textbox", { name: "Zone 1 name" })).toHaveValue("Lekki / VI");
    expect(screen.getByRole("textbox", { name: "Zone 1 fee (₦)" })).toHaveValue("2500");
  });

  it("adds and removes rows", () => {
    const { container } = render(<DeliveryForm zones={[LEKKI]} pickupNote={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Add zone" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Zone 2 name" }), {
      target: { value: "Mainland" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Zone 2 fee (₦)" }), {
      target: { value: "3,500" },
    });
    expect(submittedZones(container)).toEqual([
      { id: LEKKI.id, name: "Lekki / VI", fee: "2500", isPickup: false },
      { name: "Mainland", fee: "3,500", isPickup: false },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Lekki / VI" }));
    expect(submittedZones(container)).toEqual([
      { name: "Mainland", fee: "3,500", isPickup: false },
    ]);
  });

  it("moves a zone up", () => {
    const mainland = { ...LEKKI, id: "22222222-2222-4222-8222-222222222222", name: "Mainland" };
    const { container } = render(<DeliveryForm zones={[LEKKI, mainland]} pickupNote={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Mainland up" }));
    const zones = submittedZones(container) as { name: string }[];
    expect(zones.map((zone) => zone.name)).toEqual(["Mainland", "Lekki / VI"]);
  });

  it("pickup note appears only with a pickup zone", () => {
    render(<DeliveryForm zones={[LEKKI]} pickupNote={null} />);
    expect(screen.queryByRole("textbox", { name: "Pickup note" })).not.toBeInTheDocument();

    const row = screen.getByRole("group", { name: "Zone 1" });
    fireEvent.click(within(row).getByRole("checkbox", { name: "Customer picks up" }));
    expect(screen.getByRole("textbox", { name: "Pickup note" })).toBeInTheDocument();
  });

  it("stops adding at 20 zones", () => {
    const many = [];
    for (let i = 0; i < 20; i++) {
      many.push({
        ...LEKKI,
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        name: `Zone ${i}`,
      });
    }
    render(<DeliveryForm zones={many} pickupNote={null} />);
    expect(screen.getByRole("button", { name: "Add zone" })).toBeDisabled();
  });
});
