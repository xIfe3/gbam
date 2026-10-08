import { Module } from "@nestjs/common";
import { PlatformController } from "./platform.controller.js";

/** GET /platform/public. The settings service itself comes from InfraModule. */
@Module({ controllers: [PlatformController] })
export class PlatformModule {}
