import { describe, expect, it } from "vitest";
import { TOUR_STEPS, tourNameSchema, tourOutcomeSchema, tourStepSchema } from "./tours";

describe("tours", () => {
  it("knows each tour's length", () => {
    expect(TOUR_STEPS).toEqual({ dashboard: 4, editor: 5, order: 3 });
  });

  it("accepts steps inside the tour and rejects the rest", () => {
    expect(tourStepSchema("editor").safeParse(1).success).toBe(true);
    expect(tourStepSchema("editor").safeParse(5).success).toBe(true);
    expect(tourStepSchema("editor").safeParse(0).success).toBe(false);
    expect(tourStepSchema("editor").safeParse(6).success).toBe(false);
    expect(tourStepSchema("order").safeParse(4).success).toBe(false);
    expect(tourStepSchema("editor").safeParse(2.5).success).toBe(false);
  });

  it("only knows the three tours and two outcomes", () => {
    expect(tourNameSchema.safeParse("dashboard").success).toBe(true);
    expect(tourNameSchema.safeParse("nope").success).toBe(false);
    expect(tourOutcomeSchema.safeParse("skipped").success).toBe(true);
    expect(tourOutcomeSchema.safeParse("maybe").success).toBe(false);
  });
});
