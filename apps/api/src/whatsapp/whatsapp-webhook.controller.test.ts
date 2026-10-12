/**
 * HTTP-level test of the WhatsApp webhook's handling of customer messages: a real Nest app on
 * a random port, Redis db 1, and requests signed the way Meta signs them.
 */
import "reflect-metadata";
import { signMetaPayload } from "@gbam/integrations";
import { getQueueToken } from "@nestjs/bullmq";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InfraModule, REDIS } from "../infra/infra.module.js";
import { NOTIFICATIONS_QUEUE } from "../notifications/notifications.queue.js";
import { WhatsAppModule } from "./whatsapp.module.js";

process.loadEnvFile?.("../../.env");
const APP_SECRET = "whatsapp-webhook-test-secret";
process.env.WHATSAPP_APP_SECRET = APP_SECRET;

describe("WhatsApp webhook: customer messages (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let redis: Redis;
  let queue: Queue;
  const phones: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, WhatsAppModule] }).compile();
    // rawBody: the signature is checked against the exact bytes received, as in main.ts.
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    redis = moduleRef.get<Redis>(REDIS);
    queue = moduleRef.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
  });

  afterAll(async () => {
    for (const phone of phones) {
      await redis.del(`wa-auto-reply:${phone}`);
    }
    await app.close();
  });

  /** A made-up Nigerian number, different every time. */
  function randomPhone(): string {
    let phone = "23481";
    for (let i = 0; i < 8; i++) {
      phone = phone + String(randomInt(10));
    }
    phones.push(phone);
    return phone;
  }

  /** Sends Meta's "a customer wrote to you" webhook, signed with the app secret. */
  async function customerWrites(phone: string, text: string) {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  { from: phone, id: `wamid.${randomInt(1_000_000)}`, type: "text", text: { body: text } },
                ],
              },
            },
          ],
        },
      ],
    });
    const res = await fetch(`${baseUrl}/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signMetaPayload(body, APP_SECRET),
      },
      body,
    });
    return res.status;
  }

  /** The auto-reply jobs queued for this phone. */
  async function autoReplies(phone: string) {
    const jobs = await queue.getJobs(["waiting", "delayed", "active", "completed", "failed"]);
    const mine = [];
    for (const job of jobs) {
      if (job.id && job.id.startsWith(`auto-reply-${phone}-`)) {
        mine.push(job);
      }
    }
    return mine;
  }

  it("answers a customer's message once a day, pointing them to their shop", async () => {
    const phone = randomPhone();
    expect(await customerWrites(phone, "Hello, where is my order?")).toBe(200);
    const first = await autoReplies(phone);
    expect(first).toHaveLength(1);
    expect(first[0]?.data).toEqual({ kind: "customer.auto_reply", phone });

    // A second message the same day gets no second reply.
    expect(await customerWrites(phone, "Hello??")).toBe(200);
    expect(await autoReplies(phone)).toHaveLength(1);

    for (const job of await autoReplies(phone)) {
      await job.remove();
    }
  });
});
