import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/(signed-in)/content-actions", () => ({
  uploadContentImageAction: vi.fn(async () => ({ url: "https://photos.test/content/a.webp" })),
}));

import { ContentEditor } from "./content-editor";

const initial = {
  title: "How payouts work",
  summary: null,
  body: "Payouts arrive",
  category: null,
  sortOrder: 0,
  seoDescription: null,
  data: null,
};

describe("ContentEditor", () => {
  it("the preview follows what's typed", () => {
    render(<ContentEditor action={vi.fn()} initial={initial} type="help_article" saveLabel="Save" />);
    const body = screen.getByRole("textbox", { name: "Text (Markdown)" });
    fireEvent.change(body, { target: { value: "## Payouts\n\nThey arrive **fast**." } });
    const preview = screen.getByRole("region", { name: "Preview" });
    expect(preview.querySelector("h2")?.textContent).toBe("Payouts");
    expect(preview.querySelector("strong")?.textContent).toBe("fast");
  });

  it("Bold wraps the selected words", () => {
    render(<ContentEditor action={vi.fn()} initial={initial} type="help_article" saveLabel="Save" />);
    const body = screen.getByRole("textbox", { name: "Text (Markdown)" }) as HTMLTextAreaElement;
    body.setSelectionRange(0, 7);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(body.value).toBe("**Payouts** arrive");
  });

  it("legal pages edit their sections, sent as data", () => {
    render(
      <ContentEditor
        action={vi.fn()}
        initial={{
          ...initial,
          body: "",
          data: { sections: [{ id: "who-we-are", heading: "Who we are", body: "Gbam is...", short: "" }] },
        }}
        type="legal"
        saveLabel="Save"
      />,
    );
    expect(screen.getByDisplayValue("Who we are")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a section" }));
    const hidden = document.querySelector('input[name="data"]') as HTMLInputElement;
    const data = JSON.parse(hidden.value) as { sections: unknown[] };
    expect(data.sections).toHaveLength(2);
  });
});
