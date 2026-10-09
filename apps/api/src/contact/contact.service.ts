import { contactMessages } from "@gbam/db";
import type { ContactMessageInput } from "@gbam/shared";
import { Injectable } from "@nestjs/common";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { EmailQueue } from "../email/email.queue.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { TicketsService } from "../tickets/tickets.service.js";

const CONTACT_LIMIT = 5;
const CONTACT_WINDOW_SECONDS = 60 * 60;

@Injectable()
export class ContactService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly limiter: RateLimiter,
    private readonly emails: EmailQueue,
    private readonly tickets: TicketsService,
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

    // The message and the support ticket it opens are saved together (a transaction), so
    // there's never a message without its ticket.
    const saved = await this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(contactMessages)
        .values({ name: input.name, email: input.email, phone, message: input.message })
        .returning({ id: contactMessages.id });
      const message = rows[0];
      if (!message) {
        throw new Error("Failed to store the contact message");
      }
      const ticket = await this.tickets.create(
        {
          source: "contact",
          subject: `Message from ${input.name}`,
          message: input.message,
          requesterName: input.name,
          requesterEmail: input.email,
          contactMessageId: message.id,
        },
        tx,
      );
      return { messageId: message.id, ticketId: ticket.id };
    });

    await this.emails.send(`contact-${saved.messageId}`, {
      kind: "contact_message",
      name: input.name,
      email: input.email,
      phone,
      message: input.message,
      ticketUrl: this.tickets.adminUrl(saved.ticketId),
    });
    // "We got your message" to the sender. Its job id is tied to the message, so it's sent once.
    await this.emails.send(`contact-reply-${saved.messageId}`, {
      kind: "contact_auto_reply",
      to: input.email,
    });
    return { received: true };
  }
}
