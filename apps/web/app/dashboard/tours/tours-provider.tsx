"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { TourName } from "@gbam/shared";
import type { TourState, TourStates } from "@/lib/api";

type ToursContextValue = {
  /**
   * What the server says about each tour (step and outcome), or null if it couldn't be
   * loaded. When unknown we don't open tours by themselves (we might repeat a finished one).
   */
  states: TourStates | null;
  /** A page's tour registers its replay function; returns an "unregister" cleanup. */
  register: (replay: () => void) => () => void;
  /** Called by the "?" button. Returns false when this page has no tour. */
  replayCurrent: () => boolean;
  /** True while the current page has a tour (so "?" knows what to do). */
  hasTour: boolean;
  /** A tour moved or finished: remember it here, because the layout isn't reloaded between pages. */
  update: (tour: TourName, state: TourState) => void;
};

// Context: a way to hand values to every component inside the dashboard without passing
// them through every component in between.
const ToursContext = createContext<ToursContextValue | null>(null);

export function useTours(): ToursContextValue | null {
  return useContext(ToursContext);
}

export function ToursProvider({
  states,
  children,
}: {
  states: TourStates | null;
  children: React.ReactNode;
}) {
  // Our own copy of the progress. The dashboard layout (which loaded `states` from the server)
  // stays mounted while the seller moves between dashboard pages, so its copy goes stale.
  const [current, setCurrent] = useState<TourStates | null>(states);

  const update = useCallback((tour: TourName, state: TourState) => {
    setCurrent((previous) => {
      // Once finished, a tour stays finished here too.
      if (previous) {
        const before = previous[tour];
        if (before && before.outcome !== null) {
          return previous;
        }
      }
      const next: TourStates = { ...previous };
      next[tour] = state;
      return next;
    });
  }, []);

  // useRef: a value kept between renders that doesn't trigger a re-render when it changes.
  const replayRef = useRef<(() => void) | null>(null);
  const [hasTour, setHasTour] = useState(false);

  // useCallback keeps the same function between renders, so pages don't re-register every time.
  const register = useCallback((replay: () => void) => {
    replayRef.current = replay;
    setHasTour(true);
    return () => {
      if (replayRef.current === replay) {
        replayRef.current = null;
        setHasTour(false);
      }
    };
  }, []);

  const replayCurrent = useCallback(() => {
    const replay = replayRef.current;
    if (replay === null) {
      return false;
    }
    replay();
    return true;
  }, []);

  return (
    <ToursContext.Provider value={{ states: current, register, replayCurrent, hasTour, update }}>
      {children}
    </ToursContext.Provider>
  );
}
