import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { DomainErrorsFilter } from "./common/domain-errors.filter.js";
import { ENV, type Env } from "./env.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.useGlobalFilters(new DomainErrorsFilter());
  app.enableCors(); // TODO: restrict to the web app's origin before launch.

  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
  Logger.log(`HTTP listening on :${env.PORT}`, "Bootstrap");
}

void bootstrap();
