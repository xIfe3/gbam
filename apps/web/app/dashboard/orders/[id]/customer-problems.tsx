"use client";

import { ISSUE_REASON_LABEL } from "@gbam/shared";
import { useState, useTransition } from "react";
import { FormError } from "@/components/brand/form-bits";
import type { OrderDetail } from "@/lib/api";
import { resolveIssueAction } from "../../actions";

type Issue = OrderDetail["issues"][number];

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

/** Problems the customer reported from their tracking page, with "Mark resolved". */
export function CustomerProblems({ orderId, issues }: { orderId: string; issues: Issue[] }) {
  // useTransition: React tracks the save as pending so the button can't be pressed twice.
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);

  if (issues.length === 0) {
    return null;
  }

  function resolve(issueId: string) {
    startTransition(async () => {
      const result = await resolveIssueAction(orderId, issueId);
      setError(result.error);
    });
  }

  return (
    <section
      aria-labelledby="problems-heading"
      className="border-coral-tint flex flex-col gap-3 rounded-xl border-2 bg-white p-5"
    >
      <h2 id="problems-heading" className="text-coral-deep font-bold">
        Customer problems
      </h2>
      <FormError message={error} />
      <ul className="flex flex-col gap-3">
        {issues.map((issue) => (
          <li key={issue.id} className="bg-blush flex flex-col gap-2 rounded-lg p-3">
            <p className="text-ink font-bold">{ISSUE_REASON_LABEL[issue.reason]}</p>
            {issue.note && (
              <p className="text-ink-muted text-sm whitespace-pre-line">&ldquo;{issue.note}&rdquo;</p>
            )}
            <p className="text-ink-muted text-xs">Reported {formatWhen(issue.createdAt)}</p>
            {issue.resolvedAt === null && (
              <div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => resolve(issue.id)}
                  className="border-brand text-brand hover:bg-brand-tint focus-visible:outline-brand inline-flex min-h-11 items-center rounded-full border-2 bg-white px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                >
                  Mark resolved
                </button>
              </div>
            )}
            {issue.resolvedAt !== null && (
              <p className="text-brand-hover text-sm font-bold">
                ✓ Resolved {formatWhen(issue.resolvedAt)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
