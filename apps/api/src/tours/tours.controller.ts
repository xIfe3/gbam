import { tourNameSchema, tourOutcomeSchema, tourStepSchema, type TourName } from "@gbam/shared";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ToursService } from "./tours.service.js";

/** "editor" → "editor"; anything that isn't one of our tours → 400. */
function parseTour(raw: string): TourName {
  const parsed = tourNameSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException({ statusCode: 400, message: "Unknown tour" });
  }
  return parsed.data;
}

/**
 * Guided-tour progress for the signed-in seller. There is deliberately no endpoint that
 * deletes or resets a tour: once finished, a tour stays finished.
 */
@Controller("tours")
@UseGuards(SessionGuard)
export class ToursController {
  constructor(private readonly tours: ToursService) {}

  @Get()
  list(@CurrentSellerId() sellerId: string) {
    return this.tours.list(sellerId);
  }

  @Put(":tour/step")
  saveStep(
    @CurrentSellerId() sellerId: string,
    @Param("tour") rawTour: string,
    @Body() body: unknown,
  ) {
    const tour = parseTour(rawTour);
    // The allowed range depends on the tour, so the body is checked here, not by a pipe.
    let step: unknown = undefined;
    if (typeof body === "object" && body !== null && "step" in body) {
      step = body.step;
    }
    const parsed = tourStepSchema(tour).safeParse(step);
    if (!parsed.success) {
      throw new BadRequestException({ statusCode: 400, message: "That step isn't in this tour" });
    }
    return this.tours.saveStep(sellerId, tour, parsed.data);
  }

  @Post(":tour/finish")
  @HttpCode(200)
  finish(
    @CurrentSellerId() sellerId: string,
    @Param("tour") rawTour: string,
    @Body() body: unknown,
  ) {
    const tour = parseTour(rawTour);
    let outcome: unknown = undefined;
    if (typeof body === "object" && body !== null && "outcome" in body) {
      outcome = body.outcome;
    }
    const parsed = tourOutcomeSchema.safeParse(outcome);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Outcome must be "completed" or "skipped"',
      });
    }
    return this.tours.finish(sellerId, tour, parsed.data);
  }
}
