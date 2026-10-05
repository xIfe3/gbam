"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { TourStates } from "@/lib/api";

type ToursContextValue = {
  /** What the server says about each tour (step and outcome). */
  states: TourStates;
  /** A page's tour registers its replay function; returns an "unregister" cleanup. */
  register: (replay: () => void) => () => void;
  /** Called by the "?" button. Returns false when this page has no tour. */
  replayCurrent: () => boolean;
  /** True while the current page has a tour (so "?" knows what to do). */
  hasTour: boolean;
};

// Context: a way to hand values to every component inside the dashboard without passing
// them through every component in between.
const ToursContext = createContext<ToursContextValue | null>(null);

export function useTours(): ToursContextValue | null {
  return useContext(ToursContext);
}

export function ToursProvider({ states, children }: { states: TourStates; children: React.ReactNode }) {
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
    <ToursContext.Provider value={{ states, register, replayCurrent, hasTour }}>
      {children}
    </ToursContext.Provider>
  );
}
