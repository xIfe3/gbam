import { Module } from "@nestjs/common";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { EmailModule } from "../email/email.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SessionGuard } from "./session.guard.js";

@Module({
  // IntegrationsModule (photo storage, for the logo address) is global in the app; listed so
  // tests get it too.
  imports: [EmailModule, IntegrationsModule, RateLimiterModule],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard],
  // Modules that use @UseGuards(SessionGuard) import AuthModule to get these.
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
