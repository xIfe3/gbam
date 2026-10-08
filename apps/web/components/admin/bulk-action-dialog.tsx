"use client";

import { useState } from "react";

export type BulkOutcome = { done: string[]; skipped: { id: string; why: string }[] };

type Props = {
  /** The action's name, e.g. "Suspend". */
  label: string;
  ids: string[];
  /** One sentence saying exactly what will happen. */
  explanation: string;
  /** Riskier actions also need the number of items typed in to confirm. */
  risky?: boolean;
  /** Does the work (a server action). Gets the ids and the note. */
  run: (ids: string[], note: string) => Promise<BulkOutcome>;
};

/** "3 done, 1 skipped (Already suspended)." */
function outcomeText(outcome: BulkOutcome): string {
  let text = `${outcome.done.length} done`;
  if (outcome.skipped.length > 0) {
    const reasons: string[] = [];
    for (const skipped of outcome.skipped) {
      if (!reasons.includes(skipped.why)) {
        reasons.push(skipped.why);
      }
    }
    text = `${text}, ${outcome.skipped.length} skipped (${reasons.join("; ")})`;
  }
  return `${text}.`;
}

/**
 * The bulk-action button for a list. It opens a confirmation box that needs a note (it goes
 * in the audit log) and, for risky actions, the number of items typed in.
 */
export function BulkActionDialog({ label, ids, explanation, risky = false, run }: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [typedCount, setTypedCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (ids.length === 0) {
    return null;
  }

  const count = ids.length;
  let canConfirm = note.trim().length >= 5 && !busy;
  if (risky && typedCount.trim() !== String(count)) {
    canConfirm = false;
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await run(ids, note.trim());
      setOutcome(outcomeText(result));
    } catch {
      setError("That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setNote("");
    setTypedCount("");
    setOutcome(null);
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-full border-2 border-zinc-300 px-4 text-sm font-bold"
      >
        {label} ({count})
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={`${label} ${count}`}
      className="rounded-xl border border-zinc-300 bg-white p-4 shadow-lg"
    >
      {outcome !== null && (
        <div className="space-y-3">
          <p role="status" className="font-medium">
            {outcome}
          </p>
          <button type="button" onClick={close} className="min-h-11 font-bold underline">
            Close
          </button>
        </div>
      )}
      {outcome === null && (
        <div className="space-y-3">
          <p className="font-bold">
            {label} {count} {count === 1 ? "item" : "items"}?
          </p>
          <p className="text-sm text-zinc-600">{explanation}</p>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Note (for the audit log)
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              className="min-h-16 rounded-lg border-2 border-zinc-200 p-2 font-normal"
            />
          </label>
          {risky && (
            <label className="flex flex-col gap-1 text-sm font-bold">
              Type {count} to confirm
              <input
                value={typedCount}
                onChange={(event) => setTypedCount(event.target.value)}
                inputMode="numeric"
                className="min-h-11 rounded-lg border-2 border-zinc-200 px-2 font-normal"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-coral-deep text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canConfirm}
              onClick={confirm}
              className="bg-brand min-h-11 rounded-full px-5 font-bold text-white disabled:opacity-50"
            >
              {label} {count}
            </button>
            <button type="button" onClick={close} className="min-h-11 px-3 font-bold">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
