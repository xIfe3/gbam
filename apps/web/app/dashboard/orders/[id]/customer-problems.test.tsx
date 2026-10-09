import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../actions", () => ({ resolveIssueAction: vi.fn().mockResolvedValue({}) }));
// "Ask Gbam to help" posts through this; these tests only check it is offered.
vi.mock("@/app/dashboard/help/actions", () => ({ escalateIssueAction: vi.fn() }));

import { resolveIssueAction } from "../../actions";
import { CustomerProblems } from "./customer-problems";

const ORDER = "11111111-1111-4111-8111-111111111111";
const ISSUE = "22222222-2222-4222-8222-222222222222";

describe("CustomerProblems", () => {
  it("shows nothing when no problem was reported", () => {
    const { container } = render(<CustomerProblems orderId={ORDER} issues={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the reason and note, and marks a problem resolved", async () => {
    render(
      <CustomerProblems
        orderId={ORDER}
        issues={[
          {
            id: ISSUE,
            reason: "paid_not_marked",
            note: "Paid at 3pm",
            createdAt: "2026-10-06T09:00:00Z",
            resolvedAt: null,
          },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Customer problems" })).toBeInTheDocument();
    expect(screen.getByText("Paid but it shows unpaid")).toBeInTheDocument();
    expect(screen.getByText("“Paid at 3pm”")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark resolved" }));
    });
    expect(resolveIssueAction).toHaveBeenCalledWith(ORDER, ISSUE);
    // An open problem can also be passed to Gbam.
    expect(screen.getByText("Ask Gbam to help")).toBeInTheDocument();
  });

  it("shows resolved problems without the button", () => {
    render(
      <CustomerProblems
        orderId={ORDER}
        issues={[
          {
            id: ISSUE,
            reason: "other",
            note: null,
            createdAt: "2026-10-06T09:00:00Z",
            resolvedAt: "2026-10-06T10:00:00Z",
          },
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Mark resolved" })).toBeNull();
    expect(screen.queryByText("Ask Gbam to help")).toBeNull();
    expect(screen.getByText(/Resolved/)).toBeInTheDocument();
  });
});
