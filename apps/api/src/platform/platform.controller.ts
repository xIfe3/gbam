import { Controller, Get } from "@nestjs/common";
import { PlatformSettingsService } from "../infra/platform-settings.service.js";

/** Public platform facts the website needs on every page (maintenance, contact number...). */
@Controller("platform")
export class PlatformController {
  constructor(private readonly platform: PlatformSettingsService) {}

  @Get("public")
  publicInfo() {
    return this.platform.publicInfo();
  }
}
