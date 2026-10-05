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
