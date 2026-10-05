import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { actions } = vi.hoisted(() => ({
  actions: { uploadPhotoAction: vi.fn(), deletePhotoAction: vi.fn() },
}));
vi.mock("../actions", () => actions);

import { PhotoPicker } from "./photo-picker";

type Photo = { id: string; smallUrl: string };

let latest: Photo[] = [];

/** Holds the list like the editor does, so reordering shows up on screen. */
function Harness({ initial }: { initial: Photo[] }) {
  const [images, setImages] = useState<Photo[]>(initial);
  useEffect(() => {
    latest = images;
  }, [images]);
  return <PhotoPicker images={images} onChange={setImages} />;
}

function photo(id: string): Photo {
  return { id, smallUrl: `/${id}.webp` };
}

function pickFile(name: string) {
  const file = new File(["x"], name, { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Add photo"), { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  latest = [];
});

describe("PhotoPicker", () => {
  it("shows the error on the tile and uploads again with Try again", async () => {
    actions.uploadPhotoAction
      .mockResolvedValueOnce({ error: "We can't read this photo. Try a JPEG or PNG." })
      .mockResolvedValueOnce({ id: "new", smallUrl: "/new.webp" });
    render(<Harness initial={[]} />);

    pickFile("bad.png");
    await waitFor(() =>
      expect(screen.getByText("We can't read this photo. Try a JPEG or PNG.")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByRole("img", { name: "Photo 1" })).toBeInTheDocument());
    expect(actions.uploadPhotoAction).toHaveBeenCalledTimes(2);
    // The tile can appear a moment before the parent's list updates, so wait for both.
    await waitFor(() => expect(latest.map((p) => p.id)).toEqual(["new"]));
    expect(screen.queryByText("We can't read this photo. Try a JPEG or PNG.")).toBeNull();
  });

  it("moves photos left and right, and the first one is Main", () => {
    render(<Harness initial={[photo("a"), photo("b"), photo("c")]} />);

    fireEvent.click(screen.getByRole("button", { name: "Move photo 2 left" }));
    expect(latest.map((p) => p.id)).toEqual(["b", "a", "c"]);

    fireEvent.click(screen.getByRole("button", { name: "Move photo 2 right" }));
    expect(latest.map((p) => p.id)).toEqual(["b", "c", "a"]);

    expect(screen.getByRole("button", { name: "Move photo 1 left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move photo 3 right" })).toBeDisabled();
  });

  it("removes a photo and keeps the order of the rest", () => {
    render(<Harness initial={[photo("a"), photo("b"), photo("c")]} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove photo 2" }));

    expect(latest.map((p) => p.id)).toEqual(["a", "c"]);
    // "a" was not uploaded in this session, so the server copy is left alone.
    expect(actions.deletePhotoAction).not.toHaveBeenCalled();
  });

  it("deletes on the server only photos uploaded in this session", async () => {
    actions.uploadPhotoAction.mockResolvedValue({ id: "fresh", smallUrl: "/fresh.webp" });
    render(<Harness initial={[]} />);
    pickFile("new.png");
    await waitFor(() => expect(screen.getByRole("img", { name: "Photo 1" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));

    expect(actions.deletePhotoAction).toHaveBeenCalledWith("fresh");
  });
});
