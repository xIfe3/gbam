import { Module } from "@nestjs/common";
import { AuditService } from "../admin/audit.service.js";
import { EmailModule } from "../email/email.module.js";
import { TicketsService } from "./tickets.service.js";

/**
 * Support tickets. AuditService is listed here too (it only needs the database), so tickets
 * don't have to import the whole admin module, which itself uses tickets.
 */
@Module({
  imports: [EmailModule],
  providers: [TicketsService, AuditService],
  exports: [TicketsService],
})
export class TicketsModule {}
