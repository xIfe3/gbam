/**
 * HTTP-level test of the guided-tour endpoints: a real Nest app on a random port, the dev
 * Postgres and Redis db 1, and plain fetch().
 */
import "reflect-metadata";
import { sellers, users } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthModule } from "../auth/auth.module.js";
import { AuthService } from "../auth/auth.service.js";
import { DomainErrorsFilter } from "../common/domain-errors.filter.js";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { ToursModule } from "./tours.module.js";

process.loadEnvFile?.("../../.env");

describe("Tour endpoints over HTTP (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let auth: AuthService;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const fakeQueue = { send: async (_jobId: string, _job: EmailJob) => {} };
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, AuthModule, ToursModule],
    })
      .overrideProvider(EmailQueue)
      .useValue(fakeQueue)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorsFilter());
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    db = moduleRef.get(DB);
    auth = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    const rows = await db.select().from(users).where(inArray(users.email, createdEmails));
    const ids: string[] = [];
    for (const row of rows) {
      ids.push(row.id);
    }
    if (ids.length > 0) {
      // Deleting the shop cascades to its tour rows.
      await db.delete(sellers).where(inArray(sellers.ownerUserId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await app.close();
  });

  async function newSeller(verified = true) {
    const id = randomUUID().slice(0, 8);
    let phone = "297";
    for (let i = 0; i < 10; i++) {
      phone = phone + String(randomInt(10));
    }
    const email = `tourtest-${id}@example.com`;
    createdEmails.push(email);
    const result = await auth.signup(
      {
        businessName: "Tour Test",
        slug: `tourtest-${id}`,
        phone,
        email,
        password: "correct horse battery",
      },
      { ip: "203.0.113.13", userAgent: "vitest" },
    );
    if (verified) {
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, result.user.id));
    }
    return `Bearer ${result.sessionToken}`;
  }

  async function call(authorization: string, method: string, url: string, body?: unknown) {
    const headers: Record<string, string> = { authorization };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}${url}`, { method, headers, body: payload });
    const text = await res.text();
    let json: unknown = null;
    if (text !== "") {
      json = JSON.parse(text);
    }
    return { status: res.status, json };
  }

  it("starts empty, then saves the step going forward and back", async () => {
    const seller = await newSeller();
    expect((await call(seller, "GET", "/tours")).json).toEqual({});

    expect((await call(seller, "PUT", "/tours/editor/step", { step: 3 })).status).toBe(200);
    const back = await call(seller, "PUT", "/tours/editor/step", { step: 2 });
    expect(back.json).toEqual({ step: 2, outcome: null });

    expect((await call(seller, "GET", "/tours")).json).toEqual({
      editor: { step: 2, outcome: null },
    });
  });

  it("finishing locks the tour: later steps and finishes change nothing", async () => {
    const seller = await newSeller();
    await call(seller, "PUT", "/tours/dashboard/step", { step: 4 });
    const done = await call(seller, "POST", "/tours/dashboard/finish", { outcome: "completed" });
    expect(done.json).toEqual({ step: 4, outcome: "completed" });

    // A slow step save arriving after the finish must not reopen the tour.
    const lateStep = await call(seller, "PUT", "/tours/dashboard/step", { step: 1 });
    expect(lateStep.status).toBe(200);
    expect(lateStep.json).toEqual({ step: 4, outcome: "completed" });

    const secondFinish = await call(seller, "POST", "/tours/dashboard/finish", {
      outcome: "skipped",
    });
    expect(secondFinish.json).toEqual({ step: 4, outcome: "completed" });
  });

  it("can be skipped before any step was saved", async () => {
    const seller = await newSeller();
    const skipped = await call(seller, "POST", "/tours/order/finish", { outcome: "skipped" });
    expect(skipped.json).toEqual({ step: 1, outcome: "skipped" });
  });

  it("two finishes at the same moment leave exactly one outcome", async () => {
    const seller = await newSeller();
    const [a, b] = await Promise.all([
      call(seller, "POST", "/tours/editor/finish", { outcome: "completed" }),
      call(seller, "POST", "/tours/editor/finish", { outcome: "skipped" }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const tours = (await call(seller, "GET", "/tours")).json as Record<
      string,
      { outcome: string }
    >;
    const outcome = tours.editor?.outcome;
    expect(["completed", "skipped"]).toContain(outcome);
    // Both answers report the stored outcome, whichever request won.
    expect(a.json).toEqual(b.json);
  });

  it("rejects steps outside the tour, unknown tours and unknown outcomes", async () => {
    const seller = await newSeller();
    expect((await call(seller, "PUT", "/tours/editor/step", { step: 0 })).status).toBe(400);
    expect((await call(seller, "PUT", "/tours/editor/step", { step: 6 })).status).toBe(400);
    expect((await call(seller, "PUT", "/tours/order/step", { step: 4 })).status).toBe(400);
    expect((await call(seller, "PUT", "/tours/nope/step", { step: 1 })).status).toBe(400);
    expect(
      (await call(seller, "POST", "/tours/editor/finish", { outcome: "maybe" })).status,
    ).toBe(400);
  });

  it("keeps each seller's tours separate", async () => {
    const a = await newSeller();
    const b = await newSeller();
    await call(a, "POST", "/tours/dashboard/finish", { outcome: "completed" });
    expect((await call(b, "GET", "/tours")).json).toEqual({});
  });

  it("needs a verified seller", async () => {
    const unverified = await newSeller(false);
    expect((await call(unverified, "GET", "/tours")).status).toBe(403);
    expect((await call("Bearer nope", "GET", "/tours")).status).toBe(401);
  });
});
