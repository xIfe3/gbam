import { EmailError, type EmailClient, type SendEmailInput } from "@gbam/integrations";
import { UnrecoverableError, type Job } from "bullmq";
import { DEFAULT_PLATFORM_SETTINGS } from "@gbam/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformSettingsService } from "../infra/platform-settings.service.js";
import { EmailProcessor } from "./email.processor.js";
import type { EmailJob } from "./templates.js";

function makeProcessor(failure: Error | null) {
  const sent: SendEmailInput[] = [];
  const client: EmailClient = {
    async send(input) {
      if (failure) {
        throw failure;
      }
      sent.push(input);
      return { id: "email_1" };
    },
  };
  // Only get() is used: the inbox addresses for Gbam's own emails.
  const platform = {
    get: async () => DEFAULT_PLATFORM_SETTINGS,
  } as unknown as PlatformSettingsService;
  return { processor: new EmailProcessor(client, platform), sent };
}

const job = {
  id: "code-1",
  data: { kind: "verify_email", to: "a@b.com", code: "123456" },
} as Job<EmailJob>;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("EmailProcessor", () => {
  it("on staging, every subject says so", async () => {
    vi.stubEnv("APP_ENV", "staging");
    const { processor, sent } = makeProcessor(null);
    await processor.process(job);
    expect(sent[0]?.subject).toBe("[Staging] Your Gbam code: 123456");
  });

  it("sends the rendered email and returns the id", async () => {
    const { processor, sent } = makeProcessor(null);
    await expect(processor.process(job)).resolves.toEqual({ id: "email_1" });
    expect(sent[0]?.subject).toBe("Your Gbam code: 123456");
  });

  it.each([422, 401])("stops retrying on %i", async (status) => {
    const { processor } = makeProcessor(new EmailError("nope", status));
    await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it.each([409, 429, 500])("rethrows %i so BullMQ retries", async (status) => {
    const failure = new EmailError("later", status);
    const { processor } = makeProcessor(failure);
    const attempt = processor.process(job);
    await expect(attempt).rejects.toBe(failure);
    await expect(attempt).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it("rethrows a plain network error", async () => {
    const failure = new Error("fetch failed");
    const { processor } = makeProcessor(failure);
    await expect(processor.process(job)).rejects.toBe(failure);
  });
});
