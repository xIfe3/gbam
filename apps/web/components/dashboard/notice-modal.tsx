"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { acknowledgeNoticeAction } from "@/app/dashboard/bell-actions";
import type { Notice } from "@/lib/api";
import { typeMark } from "./notification-bits";

/**
 * An important notice from Gbam, over the whole dashboard. It can't be closed (no X, no Esc,
 * no clicking outside) until the seller taps "I understand". The layout shows one at a time;
 * once it's saved, the page refreshes and the next one (if any) appears.
 */
export function NoticeModal({ notice }: { notice: Notice }) {
  // useRef: a handle on the <dialog> element so we can open it.
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Set once the server has saved "I understand", so the dialog is allowed to close.
  const doneRef = useRef(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // useTransition: keeps the page responsive while the save runs, and tells us it's running.
  const [saving, startTransition] = useTransition();
  const router = useRouter();

  // Open it as soon as it's on the page. showModal() is the browser's own pop-up mode: the
  // rest of the page can't be clicked or tabbed to while it's open.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  // Esc normally closes a dialog. Here it must not, so the "cancel" event is stopped.
  function blockEscape(event: React.SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
  }

  // Some browsers close it anyway on a second Esc. If it closes before "I understand" was
  // saved, it opens straight back up.
  function reopenIfNotDone() {
    const dialog = dialogRef.current;
    if (dialog && !doneRef.current) {
      dialog.showModal();
    }
  }

  function acknowledge(openLink: boolean) {
    setError(undefined);
    startTransition(async () => {
      const saved = await acknowledgeNoticeAction(notice.id);
      if (!saved) {
        setError("That didn't save. Check your connection and try again.");
        return;
      }
      doneRef.current = true;
      const dialog = dialogRef.current;
      if (dialog) {
        dialog.close();
      }
      if (openLink && notice.link) {
        router.push(notice.link);
      }
    });
  }

  let savingLabel = "I understand ✓";
  if (saving) {
    savingLabel = "Saving…";
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`notice-${notice.id}-title`}
      aria-describedby={`notice-${notice.id}-body`}
      onCancel={blockEscape}
      onClose={reopenIfNotDone}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl bg-white p-6 shadow-xl backdrop:bg-black/50"
    >
      <p className="text-ink-muted mb-2 flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
        <span
          aria-hidden="true"
          className="bg-brand-tint text-ink inline-flex size-6 items-center justify-center rounded-full text-sm"
        >
          {typeMark(notice.type)}
        </span>
        Important from Gbam
      </p>
      <h2 id={`notice-${notice.id}-title`} className="text-ink text-xl font-black">
        {notice.title}
      </h2>
      <p id={`notice-${notice.id}-body`} className="text-ink mt-3 text-sm whitespace-pre-line">
        {notice.body}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        {notice.link && (
          <button
            type="button"
            onClick={() => acknowledge(true)}
            disabled={saving}
            className="text-ink hover:bg-brand-tint border-brand-tint min-h-11 rounded-full border-2 px-5 text-sm font-bold disabled:opacity-60"
          >
            I understand, open it
          </button>
        )}
        <button
          type="button"
          onClick={() => acknowledge(false)}
          disabled={saving}
          className="bg-brand hover:bg-brand-hover min-h-11 rounded-full px-5 text-sm font-bold text-white disabled:opacity-60"
        >
          {savingLabel}
        </button>
      </div>
    </dialog>
  );
}
