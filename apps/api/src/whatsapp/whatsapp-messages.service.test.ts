/** Integration test against the dev Postgres (pnpm db:up && pnpm db:migrate). */
import "reflect-metadata";
import { whatsappMessages } from "@gbam/db";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { WhatsAppMessagesService } from "./whatsapp-messages.service.js";
import { WhatsAppModule } from "./whatsapp.module.js";

process.loadEnvFile?.("../../.env");

describe("WhatsAppMessagesService (integration)", () => {
  let moduleRef: TestingModule;
  let service: WhatsAppMessagesService;
  let db: Db;
  const prefix = `wamid.test-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, WhatsAppModule],
    }).compile();
    moduleRef.enableShutdownHooks();
    service = moduleRef.get(WhatsAppMessagesService);
    db = moduleRef.get(DB);
  });

  afterAll(async () => {
    await db.delete(whatsappMessages).where(like(whatsappMessages.wamid, `${prefix}%`));
    await moduleRef.close();
  });

  /** A message row as if we'd just sent it. (No order needed for this test.) */
  async function newMessage() {
    const wamid = `${prefix}-${randomUUID()}`;
    await db.insert(whatsappMessages).values({
      wamid,
      template: "gbam_order_received",
      toPhone: "2348000000000",
      status: "accepted",
    });
    return wamid;
  }

  async function statusOf(wamid: string) {
    const rows = await db.select().from(whatsappMessages).where(eq(whatsappMessages.wamid, wamid));
    return rows[0];
  }

  function update(wamid: string, status: "sent" | "delivered" | "read" | "failed") {
    return service.applyStatusUpdate({
      messageId: wamid,
      status,
      errorCode: null,
      errorMessage: null,
    });
  }

  it("moves forward: accepted → sent → delivered → read", async () => {
    const wamid = await newMessage();
    await update(wamid, "sent");
    await update(wamid, "delivered");
    await update(wamid, "read");
    expect((await statusOf(wamid))?.status).toBe("read");
  });

  it("never moves backwards when Meta's updates arrive out of order", async () => {
    const wamid = await newMessage();
    await update(wamid, "read");
    await update(wamid, "delivered"); // arrived late
    await update(wamid, "sent"); // arrived even later
    expect((await statusOf(wamid))?.status).toBe("read");
  });

  it("records a failure with Meta's reason", async () => {
    const wamid = await newMessage();
    await update(wamid, "sent");
    await service.applyStatusUpdate({
      messageId: wamid,
      status: "failed",
      errorCode: 131026,
      errorMessage: "Recipient is not on WhatsApp",
    });
    const row = await statusOf(wamid);
    expect(row?.status).toBe("failed");
    expect(row?.errorCode).toBe(131026);
    expect(row?.errorMessage).toBe("Recipient is not on WhatsApp");
  });

  it("ignores updates for messages we never recorded", async () => {
    await expect(update(`${prefix}-unknown`, "delivered")).resolves.toBeUndefined();
  });
});
