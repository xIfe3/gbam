import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The real actions call the API; here we only check which one is called, and with what.
const { acknowledge, hide, push } = vi.hoisted(() => ({
  acknowledge: vi.fn(async () => true),
  hide: vi.fn(async () => undefined),
  push: vi.fn(),
}));
vi.mock("@/app/dashboard/bell-actions", () => ({
  acknowledgeNoticeAction: acknowledge,
  hideBannerAction: hide,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import type { Notice } from "@/lib/api";
import { NoticeBanners } from "./notice-banners";
import { NoticeModal } from "./notice-modal";

const MODAL: Notice = {
  id: "m1",
  type: "warning",
  display: "modal",
  title: "New payout rules",
  body: "From Monday, payouts go out at 9am.",
  link: "/dashboard/settings",
  createdAt: "2026-11-07T08:00:00Z",
};

const BANNER: Notice = {
  id: "b1",
  type: "info",
  display: "banner",
  title: "Add photos to sell more",
  body: "Shops with photos get more orders.",
  link: null,
  createdAt: "2026-11-07T08:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  acknowledge.mockResolvedValue(true);
  // jsdom has <dialog> but not its pop-up methods; these stand-ins just flip `open`.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

function dialog(): HTMLDialogElement {
  const element = document.querySelector("dialog");
  if (!element) {
    throw new Error("no dialog on the page");
  }
  return element;
}

describe("NoticeModal", () => {
  it("opens by itself and Esc doesn't close it", () => {
    render(<NoticeModal notice={MODAL} />);
    expect(dialog().open).toBe(true);
    expect(screen.getByText("New payout rules")).toBeInTheDocument();
    // Esc fires "cancel" on a dialog; the modal must stop it.
    const cancel = new Event("cancel", { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog().open).toBe(true);
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("opens straight back up if the browser closes it before 'I understand'", () => {
    render(<NoticeModal notice={MODAL} />);
    dialog().close();
    expect(dialog().open).toBe(true);
  });

  it("'I understand' saves it and closes", async () => {
    render(<NoticeModal notice={MODAL} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "I understand ✓" }));
    });
    expect(acknowledge).toHaveBeenCalledWith("m1");
    expect(dialog().open).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("'I understand, open it' saves it, then opens the link", async () => {
    render(<NoticeModal notice={MODAL} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "I understand, open it" }));
    });
    expect(acknowledge).toHaveBeenCalledWith("m1");
    expect(push).toHaveBeenCalledWith("/dashboard/settings");
  });

  it("stays open and says so when the save fails", async () => {
    acknowledge.mockResolvedValue(false);
    render(<NoticeModal notice={MODAL} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "I understand ✓" }));
    });
    expect(dialog().open).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("didn't save");
  });
});

describe("NoticeBanners", () => {
  it("'Got it' acknowledges it and it disappears", async () => {
    render(<NoticeBanners banners={[BANNER]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    });
    expect(acknowledge).toHaveBeenCalledWith("b1");
    expect(hide).not.toHaveBeenCalled();
    expect(screen.queryByText("Add photos to sell more")).not.toBeInTheDocument();
  });

  it("the X hides it until tomorrow", async () => {
    render(<NoticeBanners banners={[BANNER]} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: 'Hide "Add photos to sell more" until tomorrow' }),
      );
    });
    expect(hide).toHaveBeenCalledWith("b1");
    expect(acknowledge).not.toHaveBeenCalled();
    expect(screen.queryByText("Add photos to sell more")).not.toBeInTheDocument();
  });

  it("swiping it away hides it; a small move or scrolling down doesn't", async () => {
    render(<NoticeBanners banners={[BANNER]} />);
    const banner = screen.getByRole("complementary", { name: "Add photos to sell more" });
    // Scrolling down the page: left alone.
    fireEvent.touchStart(banner, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(banner, { changedTouches: [{ clientX: 100, clientY: 300 }] });
    // A small wobble: left alone.
    fireEvent.touchStart(banner, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(banner, { changedTouches: [{ clientX: 120, clientY: 95 }] });
    expect(hide).not.toHaveBeenCalled();
    // Swiped up.
    await act(async () => {
      fireEvent.touchStart(banner, { touches: [{ clientX: 100, clientY: 200 }] });
      fireEvent.touchEnd(banner, { changedTouches: [{ clientX: 100, clientY: 50 }] });
    });
    expect(hide).toHaveBeenCalledWith("b1");
  });

  it("shows nothing when there are no banners", () => {
    const { container } = render(<NoticeBanners banners={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
