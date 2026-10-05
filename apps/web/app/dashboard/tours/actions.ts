"use server";

import { tourNameSchema, tourOutcomeSchema, tourStepSchema } from "@gbam/shared";
import { unstable_rethrow } from "next/navigation";
import { api } from "@/lib/api";

// Server Actions the tour card calls in the background. A failed save must never get in the
// seller's way (the tour keeps moving), so these never throw: they log and report ok: false.
// The browser can send anything, so every input is checked again here.

export type TourSaveResult = { ok: boolean };

export async function saveTourStepAction(tour: string, step: number): Promise<TourSaveResult> {
  const name = tourNameSchema.safeParse(tour);
  if (!name.success) {
    return { ok: false };
  }
  const parsedStep = tourStepSchema(name.data).safeParse(step);
  if (!parsedStep.success) {
    return { ok: false };
  }
  try {
    await api.saveTourStep(name.data, parsedStep.data);
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    console.error("saving tour step failed", error instanceof Error ? error.message : "error");
    return { ok: false };
  }
}

export async function finishTourAction(tour: string, outcome: string): Promise<TourSaveResult> {
  const name = tourNameSchema.safeParse(tour);
  const parsedOutcome = tourOutcomeSchema.safeParse(outcome);
  if (!name.success || !parsedOutcome.success) {
    return { ok: false };
  }
  try {
    await api.finishTour(name.data, parsedOutcome.data);
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    console.error("finishing tour failed", error instanceof Error ? error.message : "error");
    return { ok: false };
  }
}
