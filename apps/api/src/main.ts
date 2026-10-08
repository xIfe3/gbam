// Must be the first import: error alerts (Sentry) start before anything else loads.
import "./instrument.js";
import "reflect-metadata";
import path from "node:path";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { DomainErrorsFilter } from "./common/domain-errors.filter.js";
import { ENV, type Env } from "./env.js";

async function bootstrap() {
  // rawBody: webhook signatures are computed over the exact bytes Paystack sent.
  // NestExpressApplication gives us useStaticAssets (serving files from a folder).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  app.useGlobalFilters(new DomainErrorsFilter());
  // No CORS: browsers never call the API directly. apps/web calls it server-side.

  const env = app.get<Env>(ENV);

  // Dev only: serve the local photo folder. In production photos come from R2.
  if (env.NODE_ENV !== "production") {
    const photosFolder = path.resolve(process.cwd(), env.PHOTOS_LOCAL_DIR);
    app.useStaticAssets(photosFolder, { prefix: "/photos" });
  }

  await app.listen(env.PORT);
  Logger.log(`HTTP listening on :${env.PORT}`, "Bootstrap");
}

void bootstrap();
