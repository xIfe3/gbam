import { contactMessageSchema, type ContactMessageInput } from "@gbam/shared";
import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import { ContactService } from "./contact.service.js";

@Controller("contact")
export class ContactController {
  constructor(
    private readonly contact: ContactService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // POST returns 201 by default in Nest, as the brief asks.
  @Post()
  submit(@Req() req: Request, @Body(new ZodPipe(contactMessageSchema)) body: ContactMessageInput) {
    return this.contact.submit(clientIp(req, this.env.INTERNAL_API_SECRET), body);
  }
}
