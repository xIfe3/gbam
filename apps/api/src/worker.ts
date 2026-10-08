// Must be the first import: error alerts (Sentry) start before anything else loads.
import "./instrument.js";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module.js";

/** No HTTP server: an application context that only runs BullMQ processors. */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log("Worker started", "Bootstrap");
}

void bootstrap();
