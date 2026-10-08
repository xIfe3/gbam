import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { AdminGuard, RequirePermission } from "./admin.guard.js";
import { AnalyticsAdminService } from "./analytics-admin.service.js";
import { daysBetween, MoneyAdminService, type DayRange } from "./money-admin.service.js";

const rangeSchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

const MAX_DAYS = 366;

/** Today in Lagos (UTC+1) as "YYYY-MM-DD". */
function lagosToday(): string {
  return new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
}

/** The range asked for, or the last 30 days. At most a year, and `from` must not be after `to`. */
export function rangeFrom(query: z.output<typeof rangeSchema>): DayRange {
  let to = lagosToday();
  if (query.to) {
    to = query.to;
  }
  let from = new Date(new Date(`${to}T12:00:00Z`).getTime() - 29 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (query.from) {
    from = query.from;
  }
  if (from > to) {
    throw new BadRequestException("The start date must be on or before the end date");
  }
  if (daysBetween({ from, to }).length > MAX_DAYS) {
    throw new BadRequestException("Pick a range of at most a year");
  }
  return { from, to };
}

/** Money and analytics reports. */
@Controller("admin")
@UseGuards(AdminGuard)
export class NumbersAdminController {
  constructor(
    private readonly money: MoneyAdminService,
    private readonly analytics: AnalyticsAdminService,
  ) {}

  @Get("money")
  @RequirePermission("money.view")
  moneyOverview(@Query(new ZodPipe(rangeSchema)) query: z.output<typeof rangeSchema>) {
    return this.money.overview(rangeFrom(query));
  }

  @Get("analytics")
  @RequirePermission("analytics.view")
  analyticsOverview(@Query(new ZodPipe(rangeSchema)) query: z.output<typeof rangeSchema>) {
    return this.analytics.overview(rangeFrom(query));
  }
}
