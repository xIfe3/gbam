import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { BeatController } from "./beat.controller.js";
import { PlatformController } from "./platform.controller.js";
import { VISITS_COPY_QUEUE, VisitsCopyQueue } from "./visits-copy.queue.js";
import { VisitsService } from "./visits.service.js";

/**
 * Public platform endpoints: GET /platform/public and the page beacon (POST /beat). The
 * settings service itself comes from InfraModule.
 */
@Module({
  imports: [RateLimiterModule, BullModule.registerQueue({ name: VISITS_COPY_QUEUE })],
  controllers: [PlatformController, BeatController],
  providers: [VisitsService, VisitsCopyQueue],
  // The admin area reads "active right now" from VisitsService.
  exports: [VisitsService],
})
export class PlatformModule {}
