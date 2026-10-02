import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { DomainErrorsFilter } from "./common/domain-errors.filter.js";
import { ENV, type Env } from "./env.js";

async function bootstrap() {
  // rawBody: webhook signatures are computed over the exact bytes Paystack sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  app.useGlobalFilters(new DomainErrorsFilter());
  // No CORS: browsers never call the API directly. apps/web calls it server-side.

  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
  Logger.log(`HTTP listening on :${env.PORT}`, "Bootstrap");
}

void bootstrap();
