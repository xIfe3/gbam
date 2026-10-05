import { z } from "zod";

/**
 * The guided tours sellers see the first time they reach a part of the dashboard.
 * The API and the web app both read the step counts from here, so a step number
 * can never point past the end of a tour.
 */
export const TOUR_NAMES = ["dashboard", "editor", "order"] as const;
export type TourName = (typeof TOUR_NAMES)[number];

export const TOUR_STEPS: Record<TourName, number> = {
  dashboard: 4,
  editor: 5,
  order: 3,
};

export const tourNameSchema = z.enum(TOUR_NAMES);

/** How a tour ended. Once a seller has one of these, that tour never shows by itself again. */
export const tourOutcomeSchema = z.enum(["completed", "skipped"]);
export type TourOutcome = z.infer<typeof tourOutcomeSchema>;

/** A step number for one tour: a whole number from 1 to that tour's length. */
export function tourStepSchema(tour: TourName) {
  return z.number().int().min(1).max(TOUR_STEPS[tour]);
}
