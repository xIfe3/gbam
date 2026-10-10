import { sellers } from "@gbam/db";
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { checkUnsubscribeToken } from "./unsubscribe.js";

const unsubscribeSchema = z.object({
  /** The seller's id. */
  s: z.uuid(),
  /** The signed token from the link. */
  t: z.string().min(1).max(200),
});

/**
 * The unsubscribe link in announcement emails (and the one-click button email apps show,
 * which posts to the same place through the website). Turns off "news and tips" only;
 * service emails about orders, payments and the account always still send.
 */
@Controller("email")
export class UnsubscribeController {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post("unsubscribe")
  @HttpCode(200)
  async unsubscribe(
    @Body(new ZodPipe(unsubscribeSchema)) body: z.output<typeof unsubscribeSchema>,
  ) {
    const key = this.env.UNSUBSCRIBE_SIGNING_KEY;
    if (!key) {
      throw new ServiceUnavailableException("Unsubscribe links aren't set up");
    }
    if (!checkUnsubscribeToken(body.s, body.t, key)) {
      throw new BadRequestException("This unsubscribe link isn't valid");
    }
    await this.db.update(sellers).set({ newsEmails: false }).where(eq(sellers.id, body.s));
    return { ok: true };
  }
}
