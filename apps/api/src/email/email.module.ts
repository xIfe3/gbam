import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { EMAILS_QUEUE, EmailQueue } from "./email.queue.js";

/** Producer only. The processor is registered in WorkerModule so HTTP never consumes jobs. */
@Module({
  imports: [BullModule.registerQueue({ name: EMAILS_QUEUE })],
  providers: [EmailQueue],
  exports: [EmailQueue, BullModule],
})
export class EmailModule {}
