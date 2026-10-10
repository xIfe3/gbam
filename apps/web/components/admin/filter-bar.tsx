"use client";

import { useEffect, useState } from "react";

/**
 * The filter bar: a plain GET form, so submitting it puts the filters in the address bar
 * (?q=…&status=…). Bookmarkable, shareable, and Back works.
 *
 * On wide screens it sits in a row above the list. On phones it hides behind a "Filters"
 * button and opens as a bottom sheet: it slides up from the bottom over part of the screen
 * (never more than three quarters), the page stays visible behind a dim layer, and a tap on
 * that layer, ✕ or Escape closes it.
 */
export function FilterBar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Escape closes the sheet while it's open.
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  let formClasses = "hidden md:flex md:flex-wrap md:items-end md:gap-2";
  // Open on a phone it's a dialog over the page; otherwise it's the page's search form.
  let role: "dialog" | "search" = "search";
  let modal: true | undefined = undefined;
  if (open) {
    role = "dialog";
    modal = true;
    formClasses =
      "sheet-up fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-4 pb-6 shadow-2xl md:static md:z-auto md:max-h-none md:flex-row md:flex-wrap md:items-end md:gap-2 md:overflow-visible md:rounded-none md:bg-transparent md:p-0 md:shadow-none";
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-full border-2 border-zinc-300 bg-white px-5 font-bold md:hidden"
      >
        Filters
      </button>
      {open && (
        <div
          data-testid="sheet-backdrop"
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}
      <form
        method="get"
        role={role}
        aria-modal={modal}
        aria-label="Filters"
        className={formClasses}
      >
        {open && (
          <div className="flex flex-col items-center gap-3 md:hidden">
            {/* The grab bar: shows this is a sheet that came up from the bottom. */}
            <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-zinc-300" />
            <div className="flex w-full items-center justify-between">
              <h2 className="text-ink text-lg font-bold">Filters</h2>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setOpen(false)}
                className="flex size-11 items-center justify-center rounded-full text-xl"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {children}
        <div className="flex gap-2 md:contents">
          <button
            type="submit"
            className="bg-brand min-h-11 flex-1 rounded-full px-5 font-bold text-white md:flex-none"
          >
            Apply
          </button>
          {/* "?" is this same page with no filters in the address. */}
          <a
            href="?"
            className="flex min-h-11 flex-1 items-center justify-center rounded-full border-2 border-zinc-300 px-5 font-bold md:flex-none"
          >
            Clear
          </a>
        </div>
      </form>
    </>
  );
}
