import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { redirect, apiMock, FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return {
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    apiMock: {
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
      setProductStatus: vi.fn(),
      deleteProduct: vi.fn(),
      uploadProductPhoto: vi.fn(),
      deleteProductPhoto: vi.fn(),
    },
    FakeApiError,
  };
});
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock, ApiError: FakeApiError }));

import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
  uploadPhotoAction,
} from "./actions";

const IMG = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";

function validInput() {
  return {
    name: "Ankara Dress",
    imageIds: [IMG],
    options: [],
    variants: [
      { optionValues: [], priceKobo: 1200000, stock: null, imageId: null, isEnabled: true },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateProductAction", () => {
  it("maps an API 409 to the stale-save message", async () => {
    apiMock.updateProduct.mockRejectedValue(new FakeApiError(409, { message: "conflict" }));
    const result = await updateProductAction(PRODUCT_ID, validInput(), 3);
    expect(result.error).toBe(
      "This product changed since you opened it. Reload to see the latest.",
    );
  });

  it("turns the API's stale-variant error into a variants field error", async () => {
    apiMock.updateProduct.mockRejectedValue(
      new FakeApiError(400, {
        message: "Validation failed",
        issues: {
          formErrors: [],
          fieldErrors: {
            variants: ["One of the options no longer exists. Reload to see the latest."],
          },
        },
      }),
    );
    const result = await updateProductAction(PRODUCT_ID, validInput(), 3);
    expect(result.fieldErrors).toEqual({
      variants: "One of the options no longer exists. Reload to see the latest.",
    });
  });

  it("sends the version along with the product", async () => {
    apiMock.updateProduct.mockResolvedValue({});
    await expect(updateProductAction(PRODUCT_ID, validInput(), 3)).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/products",
    );
    const sent = apiMock.updateProduct.mock.calls[0];
    expect(sent?.[0]).toBe(PRODUCT_ID);
    expect(sent?.[1].version).toBe(3);
    expect(sent?.[1].name).toBe("Ankara Dress");
  });

  it("returns field errors for bad input without calling the API", async () => {
    const input = validInput();
    input.variants[0] = { ...input.variants[0]!, priceKobo: 5 };
    const result = await updateProductAction(PRODUCT_ID, input, 1);
    expect(result.fieldErrors?.["variants.0.price"]).toBe("Minimum price is ₦100");
    expect(apiMock.updateProduct).not.toHaveBeenCalled();
  });
});

describe("createProductAction", () => {
  it("redirects to the list after saving", async () => {
    apiMock.createProduct.mockResolvedValue({});
    await expect(createProductAction(validInput())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/products",
    );
  });

  it("shows the API's message for a rejected product", async () => {
    apiMock.createProduct.mockRejectedValue(new FakeApiError(400, { message: "Photo not found" }));
    const result = await createProductAction(validInput());
    expect(result.error).toBe("Photo not found");
  });

  it("turns the API's imageIds error into a photos field error with the real text", async () => {
    apiMock.createProduct.mockRejectedValue(
      new FakeApiError(400, {
        message: "Validation failed",
        issues: {
          formErrors: [],
          fieldErrors: { imageIds: ["One of the photos can't be used. Upload it again."] },
        },
      }),
    );
    const result = await createProductAction(validInput());
    expect(result.error).toBeUndefined();
    expect(result.fieldErrors).toEqual({
      images: "One of the photos can't be used. Upload it again.",
    });
  });

  it("hides the details of a server failure", async () => {
    apiMock.createProduct.mockRejectedValue(new FakeApiError(500, { message: "stack trace" }));
    const result = await createProductAction(validInput());
    expect(result.error).toBe("Something went wrong on our side. Please try again.");
  });
});

describe("deleteProductAction", () => {
  it("redirects to the list after deleting or archiving", async () => {
    apiMock.deleteProduct.mockResolvedValue({ archived: true });
    await expect(deleteProductAction(PRODUCT_ID)).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/products",
    );
  });
});

describe("uploadPhotoAction", () => {
  it("passes the photo to the API as multipart form data", async () => {
    apiMock.uploadProductPhoto.mockResolvedValue({ id: IMG, smallUrl: "/small.webp" });
    const form = new FormData();
    form.set("photo", new File(["x"], "dress.png", { type: "image/png" }));

    const result = await uploadPhotoAction(form);

    expect(result).toEqual({ id: IMG, smallUrl: "/small.webp" });
    const sent = apiMock.uploadProductPhoto.mock.calls[0]?.[0] as FormData;
    expect(sent).toBeInstanceOf(FormData);
    expect((sent.get("photo") as File).name).toBe("dress.png");
  });

  it("refuses a request with no photo", async () => {
    const result = await uploadPhotoAction(new FormData());
    expect(result).toEqual({ error: "Choose a photo to upload." });
    expect(apiMock.uploadProductPhoto).not.toHaveBeenCalled();
  });

  it("refuses a photo over 10 MB before sending it", async () => {
    const form = new FormData();
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", {
      type: "image/jpeg",
    });
    form.set("photo", big);
    const result = await uploadPhotoAction(form);
    expect(result).toEqual({ error: "Photos can be up to 10 MB" });
    expect(apiMock.uploadProductPhoto).not.toHaveBeenCalled();
  });

  it("passes on the API's message for a photo it can't read", async () => {
    apiMock.uploadProductPhoto.mockRejectedValue(
      new FakeApiError(400, { message: "We can't read this photo. Try a JPEG or PNG." }),
    );
    const form = new FormData();
    form.set("photo", new File(["x"], "bad.png", { type: "image/png" }));
    const result = await uploadPhotoAction(form);
    expect(result).toEqual({ error: "We can't read this photo. Try a JPEG or PNG." });
  });
});
