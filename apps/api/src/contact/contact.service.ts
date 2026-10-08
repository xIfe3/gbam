import { contactMessages } from "@gbam/db";
import type { ContactMessageInput } from "@gbam/shared";
import { Injectable } from "@nestjs/common";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { EmailQueue } from "../email/email.queue.js";
import { InjectDb, type Db } from "../infra/infra.module.js";

const CONTACT_LIMIT = 5;
const CONTACT_WINDOW_SECONDS = 60 * 60;

@Injectable()
export class ContactService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly limiter: RateLimiter,
    private readonly emails: EmailQueue,
  ) {}

  async submit(ip: string, input: ContactMessageInput): Promise<{ received: true }> {
    const limit = await this.limiter.hit(`contact:${ip}`, CONTACT_LIMIT, CONTACT_WINDOW_SECONDS);
    if (!limit.allowed) {
      throw new TooManyRequestsError(limit.retryAfterSeconds);
    }

    let phone: string | null = null;
    if (input.phone) {
      phone = input.phone;
    }

    const rows = await this.db
      .insert(contactMessages)
      .values({ name: input.name, email: input.email, phone, message: input.message })
      .returning({ id: contactMessages.id });
    const row = rows[0];
    if (!row) {
      throw new Error("Failed to store the contact message");
    }

    await this.emails.send(`contact-${row.id}`, {
      kind: "contact_message",
      name: input.name,
      email: input.email,
      phone,
      message: input.message,
    });
    // "We got your message" to the sender. Its job id is tied to the message, so it's sent once.
    await this.emails.send(`contact-reply-${row.id}`, {
      kind: "contact_auto_reply",
      to: input.email,
    });
    return { received: true };
  }
}
