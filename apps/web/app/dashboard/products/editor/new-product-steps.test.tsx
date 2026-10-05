import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { actions } = vi.hoisted(() => ({
  actions: {
    uploadPhotoAction: vi.fn(),
    deletePhotoAction: vi.fn(),
    createProductAction: vi.fn(),
  },
}));
vi.mock("../actions", () => actions);

import { NewProductSteps } from "./new-product-steps";

const IMG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  actions.uploadPhotoAction.mockResolvedValue({ id: IMG, smallUrl: "/small.webp" });
  actions.createProductAction.mockResolvedValue({});
});

function clickNext() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

async function addPhoto() {
  const input = screen.getByLabelText("Add photo");
  const file = new File(["x"], "dress.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("img", { name: "Photo 1" })).toBeInTheDocument());
}

async function fillStep1() {
  await addPhoto();
  fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Ankara Dress" } });
}

function addValue(text: string) {
  const input = screen.getByLabelText("Add a value");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

describe("NewProductSteps", () => {
  it("can't leave step 1 without a photo and a name", () => {
    render(<NewProductSteps />);
    clickNext();

    expect(screen.getByRole("heading", { name: /step 1 of 3/i })).toBeInTheDocument();
    expect(screen.getByText("Add at least one photo")).toBeInTheDocument();
    expect(screen.getByText("Enter a product name")).toBeInTheDocument();
  });

  it("uploads a photo straight away and sends it to the server action", async () => {
    render(<NewProductSteps />);
    await addPhoto();

    const sent = actions.uploadPhotoAction.mock.calls[0]?.[0] as FormData;
    expect((sent.get("photo") as File).name).toBe("dress.png");
    expect(screen.getByText("Main")).toBeInTheDocument();
  });

  it("shows one price field after choosing No", async () => {
    render(<NewProductSteps />);
    await fillStep1();
    clickNext();

    fireEvent.click(screen.getByLabelText("No"));
    expect(screen.getByLabelText("Price (₦)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Option name")).toBeNull();
  });

  it("keeps option values when going Back from step 3", async () => {
    render(<NewProductSteps />);
    await fillStep1();
    clickNext();

    fireEvent.click(screen.getByLabelText("Yes"));
    fireEvent.change(screen.getByLabelText("Option name"), { target: { value: "Size" } });
    addValue("S");
    addValue("M");
    clickNext();

    expect(screen.getByRole("heading", { name: /step 3 of 3/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Price for S")).toBeInTheDocument();
    expect(screen.getByLabelText("Price for M")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("heading", { name: /step 2 of 3/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Size")).toBeInTheDocument();
    expect(screen.getByDisplayValue("S")).toBeInTheDocument();
    expect(screen.getByDisplayValue("M")).toBeInTheDocument();
  });

  it("submits the built product to createProductAction", async () => {
    render(<NewProductSteps />);
    await fillStep1();
    clickNext();

    fireEvent.click(screen.getByLabelText("No"));
    fireEvent.change(screen.getByLabelText("Price (₦)"), { target: { value: "₦12,000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));

    await waitFor(() => expect(actions.createProductAction).toHaveBeenCalledTimes(1));
    expect(actions.createProductAction).toHaveBeenCalledWith({
      name: "Ankara Dress",
      imageIds: [IMG],
      options: [],
      variants: [
        { optionValues: [], priceKobo: 1200000, stock: null, imageId: null, isEnabled: true },
      ],
    });
  });

  it("jumps to the step with the problem when the server sends field errors back", async () => {
    actions.createProductAction.mockResolvedValue({
      fieldErrors: { name: "Enter a product name" },
    });
    render(<NewProductSteps />);
    await fillStep1();
    clickNext();
    fireEvent.click(screen.getByLabelText("No"));
    fireEvent.change(screen.getByLabelText("Price (₦)"), { target: { value: "12000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /step 1 of 3/i })).toBeInTheDocument(),
    );
    expect(screen.getByText("Enter a product name")).toBeInTheDocument();
  });

  async function reachSizeOptions() {
    render(<NewProductSteps />);
    await fillStep1();
    clickNext();
    fireEvent.click(screen.getByLabelText("Yes"));
    fireEvent.change(screen.getByLabelText("Option name"), { target: { value: "Size" } });
  }

  it("renaming M to Large while L exists keeps M's price and stock, and L's too", async () => {
    await reachSizeOptions();
    addValue("M");
    addValue("L");
    clickNext();
    fireEvent.change(screen.getByLabelText("Price for M"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Stock for M"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Price for L"), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    // Typing "Large" passes through "L" (a value that already exists). Nothing may happen
    // until the seller finishes with the chip.
    const chip = screen.getByLabelText("Edit value M");
    fireEvent.change(chip, { target: { value: "L" } });
    fireEvent.change(chip, { target: { value: "La" } });
    fireEvent.change(chip, { target: { value: "Large" } });
    fireEvent.blur(chip);
    clickNext();

    expect(screen.getByLabelText("Price for Large")).toHaveValue("1000");
    expect(screen.getByLabelText("Stock for Large")).toHaveValue("4");
    expect(screen.getByLabelText("Price for L")).toHaveValue("2000");
  });

  it("saves a value renamed with a trailing space", async () => {
    await reachSizeOptions();
    addValue("M");
    const chip = screen.getByLabelText("Edit value M");
    fireEvent.change(chip, { target: { value: "Medium " } });
    fireEvent.blur(chip);
    clickNext();
    fireEvent.change(screen.getByLabelText("Price for Medium"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));

    await waitFor(() => expect(actions.createProductAction).toHaveBeenCalledTimes(1));
    const sent = actions.createProductAction.mock.calls[0]?.[0];
    expect(sent.options[0].values).toEqual(["Medium"]);
    expect(sent.variants[0].optionValues).toEqual(["Medium"]);
  });

  it("shows the API's photo error near the photos", async () => {
    actions.createProductAction.mockResolvedValue({
      fieldErrors: { images: "One of the photos can't be used. Upload it again." },
    });
    render(<NewProductSteps />);
    await fillStep1();
    clickNext();
    fireEvent.click(screen.getByLabelText("No"));
    fireEvent.change(screen.getByLabelText("Price (₦)"), { target: { value: "12000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /step 1 of 3/i })).toBeInTheDocument(),
    );
    expect(
      screen.getByText("One of the photos can't be used. Upload it again."),
    ).toBeInTheDocument();
  });

  it("shows an error that no field claims", async () => {
    actions.createProductAction.mockResolvedValue({
      fieldErrors: { "variants.0.optionValues.0": "That value is not one of the option's values" },
    });
    render(<NewProductSteps />);
    await fillStep1();
    clickNext();
    fireEvent.click(screen.getByLabelText("No"));
    fireEvent.change(screen.getByLabelText("Price (₦)"), { target: { value: "12000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));

    expect(
      await screen.findByText("That value is not one of the option's values"),
    ).toBeInTheDocument();
  });

  it("stops at the options step when there would be more than 50 combinations", async () => {
    await reachSizeOptions();
    addValue("a1,a2,a3,a4,a5,a6,a7,a8");
    fireEvent.click(screen.getByRole("button", { name: "Add another option" }));
    const names = screen.getAllByLabelText("Option name");
    fireEvent.change(names[1] as HTMLElement, { target: { value: "Colour" } });
    const adders = screen.getAllByLabelText("Add a value");
    fireEvent.change(adders[1] as HTMLElement, { target: { value: "b1,b2,b3,b4,b5,b6,b7" } });
    clickNext();

    expect(screen.getByRole("heading", { name: /step 2 of 3/i })).toBeInTheDocument();
    expect(
      screen.getByText("That makes 56 combinations; the most is 50. Remove some values."),
    ).toBeInTheDocument();
  });

  it("jumps back to the step with the problem when saving fails", async () => {
    render(<NewProductSteps />);
    await fillStep1();
    clickNext();

    fireEvent.click(screen.getByLabelText("No"));
    // No price typed, so the save is refused before it reaches the server.
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));

    expect(actions.createProductAction).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /step 2 of 3/i })).toBeInTheDocument();
    expect(screen.getByText("Enter a price, like 12,000")).toBeInTheDocument();
  });
});
