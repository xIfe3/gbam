import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodeInput } from "./fields";

function boxes() {
  return screen.getAllByRole("textbox") as HTMLInputElement[];
}

function box(index: number): HTMLInputElement {
  const found = boxes()[index];
  if (!found) {
    throw new Error(`no box ${index}`);
  }
  return found;
}

describe("CodeInput", () => {
  it("moves focus forward when a digit is typed", () => {
    render(<CodeInput label="Code" />);
    fireEvent.change(box(0), { target: { value: "4" } });
    expect(box(1)).toHaveFocus();
  });

  it("fills every box when a full code is pasted", () => {
    render(<CodeInput label="Code" />);
    fireEvent.paste(box(0), { clipboardData: { getData: () => "123456" } });
    expect(boxes().map((b) => b.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("fills every box when autofill delivers the whole code to the first box via change", () => {
    const onChange = vi.fn();
    render(<CodeInput label="Code" onChange={onChange} />);
    fireEvent.change(box(0), { target: { value: "123456" } });
    expect(boxes().map((b) => b.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(onChange).toHaveBeenLastCalledWith("123456");
    expect(box(5)).toHaveFocus();
  });

  it("strips non-digits from a whole-code change", () => {
    render(<CodeInput label="Code" />);
    fireEvent.change(box(0), { target: { value: "12 34-56" } });
    expect(boxes().map((b) => b.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("replaces a filled digit when typing over it", () => {
    render(<CodeInput label="Code" />);
    fireEvent.change(box(0), { target: { value: "1" } });
    // The browser would deliver "12" when typing into a box that already holds "1".
    fireEvent.change(box(0), { target: { value: "12" } });
    expect(box(0).value).toBe("2");
  });

  it("moves back on Backspace in an empty box", () => {
    render(<CodeInput label="Code" />);
    box(2).focus();
    fireEvent.keyDown(box(2), { key: "Backspace" });
    expect(box(1)).toHaveFocus();
  });

  it("shrinks its boxes to fit a 360px phone (about 280px inside the auth card)", () => {
    render(<CodeInput label="Code" />);
    // Fixed 44px boxes (w-11) need 6 × 44 + 5 gaps = 304px and overflow. Flexible boxes
    // share the row instead: at most 44px wide, allowed to shrink below their content.
    for (const input of boxes()) {
      expect(input).toHaveClass("flex-1", "min-w-0", "max-w-11", "h-12");
      expect(input).not.toHaveClass("w-11");
    }
    const row = box(0).parentElement;
    if (row === null) {
      throw new Error("Expected the boxes to sit in a row");
    }
    expect(row).toHaveClass("flex", "gap-1.5");
    expect(row).not.toHaveClass("gap-2");
  });

  it("links the error to each box", () => {
    render(<CodeInput label="Code" error="Wrong code" />);
    const alert = screen.getByRole("alert");
    expect(box(0)).toHaveAttribute("aria-describedby", alert.id);
  });
});
