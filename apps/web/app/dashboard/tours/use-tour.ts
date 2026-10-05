"use client";

import type { TourName } from "@gbam/shared";
import { useState } from "react";
import type { TourState } from "@/lib/api";
import { finishTourAction, saveTourStepAction } from "./actions";

/** "Fire and forget": start the save but never wait for it or let its failure stop the tour. */
function inBackground(save: Promise<unknown>) {
  save.catch(() => {
    // The action already logged it on the server; the seller just keeps going.
  });
}

/** The saved step, kept between 1 and the tour's current length (tours can get shorter). */
function startingStep(saved: TourState | undefined, stepCount: number): number {
  if (!saved) {
    return 1;
  }
  if (saved.step < 1) {
    return 1;
  }
  if (saved.step > stepCount) {
    return stepCount;
  }
  return saved.step;
}

/**
 * The state of one guided tour on one page.
 * - Opens by itself only if the seller hasn't finished or skipped it before.
 * - Back/Next save the step on the server so it resumes there, on any device.
 * - replay() (the "?" button) starts again from step 1 and saves nothing.
 */
export function useTour(tour: TourName, stepCount: number, saved: TourState | undefined) {
  const finishedBefore = saved !== undefined && saved.outcome !== null;
  // useState: values React remembers between re-renders of this page.
  const [open, setOpen] = useState(!finishedBefore);
  const [step, setStep] = useState(startingStep(saved, stepCount));
  const [replaying, setReplaying] = useState(false);

  function goTo(newStep: number) {
    setStep(newStep);
    if (!replaying) {
      inBackground(saveTourStepAction(tour, newStep));
    }
  }

  function next() {
    if (step < stepCount) {
      goTo(step + 1);
    }
  }

  function back() {
    if (step > 1) {
      goTo(step - 1);
    }
  }

  function end(outcome: "completed" | "skipped") {
    setOpen(false);
    if (!replaying) {
      inBackground(finishTourAction(tour, outcome));
    }
  }

  function replay() {
    setReplaying(true);
    setStep(1);
    setOpen(true);
  }

  return {
    open,
    step,
    next,
    back,
    skip: () => end("skipped"),
    done: () => end("completed"),
    replay,
  };
}
