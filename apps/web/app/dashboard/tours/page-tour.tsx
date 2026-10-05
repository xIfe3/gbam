"use client";

import type { TourName } from "@gbam/shared";
import { useEffect, useRef } from "react";
import type { TourState } from "@/lib/api";
import { TourCard } from "./tour-card";
import { TOURS } from "./tour-steps";
import { useTours } from "./tours-provider";
import { useTour } from "./use-tour";

/**
 * Put one of these on a page to give it a tour. It opens by itself the first time, resumes
 * on the saved step, and listens for the "?" button to replay it.
 */
export function PageTour({ tour }: { tour: TourName }) {
  const tours = useTours();
  let saved: TourState | undefined = undefined;
  if (tours && tours.states === null) {
    // Progress couldn't be loaded: treat it as finished so it only opens through "?".
    saved = { step: 1, outcome: "skipped" };
  } else if (tours && tours.states) {
    saved = tours.states[tour];
  }
  return <PageTourWith tour={tour} saved={saved} />;
}

/** The same, with the saved state passed in directly (used by PageTour and in tests). */
export function PageTourWith({ tour, saved }: { tour: TourName; saved: TourState | undefined }) {
  const steps = TOURS[tour];
  const tours = useTours();
  let onChange: ((state: TourState) => void) | undefined = undefined;
  if (tours) {
    const update = tours.update;
    onChange = (state) => update(tour, state);
  }
  const state = useTour(tour, steps.length, saved, onChange);

  // Tell the "?" button which tour this page has, so it can replay it. The ref always holds
  // the newest replay function; we register one stable wrapper, once, that calls it.
  const replayRef = useRef(state.replay);
  // Refs may only be written after rendering, so keep it up to date in an effect.
  useEffect(() => {
    replayRef.current = state.replay;
  });
  const register = tours?.register;
  useEffect(() => {
    if (!register) {
      return;
    }
    return register(() => replayRef.current());
  }, [register]);

  if (!state.open) {
    return null;
  }
  return (
    <>
      {/* Space at the end of the page so the card never hides the page's last button. */}
      <div aria-hidden="true" className="h-80" />
      <TourCard
        steps={steps}
        step={state.step}
        onNext={state.next}
        onBack={state.back}
        onSkip={state.skip}
        onDone={state.done}
      />
    </>
  );
}
