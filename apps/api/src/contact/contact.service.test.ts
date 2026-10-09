/** Integration test against the dev Postgres and Redis db 1. The email queue is a recorder. */
import "reflect-metadata";
import { contactMessages, supportTickets } from "@gbam/db";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TooManyRequestsError } from "../common/rate-limiter.js";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { ContactModule } from "./contact.module.js";
import { ContactService } from "./contact.service.js";

process.loadEnvFile?.("../../.env");

describe("ContactService (integration)", () => {
  let moduleRef: TestingModule;
  let service: ContactService;
  let db: Db;
  let redis: Redis;
  const sent: { jobId: string; job: EmailJob }[] = [];
  const ip = `test-ip-${randomUUID()}`;
  const emailAddress = `contact-${randomUUID().slice(0, 8)}@example.com`;

  const input = {
    name: "Ada",
    email: emailAddress,
    phone: undefined,
    message: "Hello, I would like to know more.",
  };

  beforeAll(async () => {
    const fakeQueue = {
      send: async (jobId: string, job: EmailJob) => {
        sent.push({ jobId, job });
      },
    };
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, ContactModule] })
      .overrideProvider(EmailQueue)
      .useValue(fakeQueue)
      .compile();
    service = moduleRef.get(ContactService);
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);
  });

  afterAll(async () => {
    await db.delete(supportTickets).where(eq(supportTickets.requesterEmail, emailAddress));
    await db.delete(contactMessages).where(eq(contactMessages.email, emailAddress));
    await redis.del(`contact:${ip}`);
    await moduleRef.close();
  });

  it("stores the message as new and queues the email", async () => {
    const result = await service.submit(ip, { ...input, phone: "2348031234567" });
    expect(result).toEqual({ received: true });

    const rows = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.email, emailAddress));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("new");
    expect(rows[0]?.phone).toBe("2348031234567");

    // Two emails: the message to our inbox, and "we got your message" to the sender.
    expect(sent).toHaveLength(2);
    expect(sent[0]?.jobId).toBe(`contact-${rows[0]?.id}`);
    expect(sent[0]?.job).toEqual({
      kind: "contact_message",
      name: "Ada",
      email: emailAddress,
      phone: "2348031234567",
      message: input.message,
      ticketUrl: expect.stringContaining("/admin/tickets/"),
    });
    expect(sent[1]?.jobId).toBe(`contact-reply-${rows[0]?.id}`);
    expect(sent[1]?.job).toEqual({ kind: "contact_auto_reply", to: emailAddress });
  });

  it("rejects the 6th submission from the same IP within the hour", async () => {
    for (let i = 0; i < 4; i++) {
      await service.submit(ip, input);
    }
    await expect(service.submit(ip, input)).rejects.toBeInstanceOf(TooManyRequestsError);

    const rows = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.email, emailAddress));
    expect(rows).toHaveLength(5); // the blocked one was not stored
    expect(sent).toHaveLength(10); // two emails each, and none for the blocked one
  });

  it("does not limit a different IP", async () => {
    const other = `test-ip-${randomUUID()}`;
    try {
      await expect(service.submit(other, input)).resolves.toEqual({ received: true });
    } finally {
      await redis.del(`contact:${other}`);
    }
  });
});
