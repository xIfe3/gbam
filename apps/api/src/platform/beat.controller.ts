import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { clientIp } from "../common/client-ip.js";
import { RateLimiter } from "../common/rate-limiter.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import { BEAT_KINDS, VisitsService } from "./visits.service.js";

const beatSchema = z.object({
  // A random id the page makes for its tab; letters, digits, - and _ only.
  tabId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  kind: z.enum(BEAT_KINDS),
  shop: z.string().max(100).optional(),
  first: z.boolean(),
});

/** Plenty for real visitors on one network (an office, a phone carrier's shared IP). */
const BEATS_PER_IP_PER_MINUTE = 600;

/** The page beacon: "this tab is here". Public, counts only. */
@Controller("beat")
export class BeatController {
  constructor(
    private readonly visits: VisitsService,
    private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post()
  @HttpCode(204)
  async beat(
    @Req() req: Request,
    @Body(new ZodPipe(beatSchema)) body: z.output<typeof beatSchema>,
  ) {
    const ip = clientIp(req, this.env.INTERNAL_API_SECRET);
    const limit = await this.limiter.hit(`beat-ip:${ip}`, BEATS_PER_IP_PER_MINUTE, 60);
    if (!limit.allowed) {
      // Quietly drop it: a beacon never shows an error to anyone.
      return;
    }
    let userAgent: string | undefined = undefined;
    const header = req.headers["user-agent"];
    if (typeof header === "string") {
      userAgent = header;
    }
    await this.visits.beat(body, userAgent);
  }
}
