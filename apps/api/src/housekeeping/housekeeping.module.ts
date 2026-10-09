import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { HOUSEKEEPING_QUEUE, HousekeepingQueue } from "./housekeeping.queue.js";
import { HousekeepingService } from "./housekeeping.service.js";

/** The daily tidy-up job: the schedule (API and worker) and the work itself (worker). */
@Module({
  imports: [BullModule.registerQueue({ name: HOUSEKEEPING_QUEUE })],
  providers: [HousekeepingService, HousekeepingQueue],
  exports: [HousekeepingService],
})
export class HousekeepingModule {}
