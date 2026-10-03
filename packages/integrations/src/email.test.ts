import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailError, FakeEmailClient, ResendEmailClient } from "./email";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResendEmailClient", () => {
  it("sends the bearer key and the JSON body, and returns the id", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "email_1" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new ResendEmailClient("re_key", "Gbam <no-reply@gbam.app>");
    const result = await client.send({
      to: "a@b.com",
      subject: "Hi",
      text: "plain",
      html: "<p>plain</p>",
      replyTo: "c@d.com",
    });

    expect(result).toEqual({ id: "email_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Gbam <no-reply@gbam.app>",
      to: ["a@b.com"],
      subject: "Hi",
      text: "plain",
      html: "<p>plain</p>",
      reply_to: "c@d.com",
    });
  });

  it("omits reply_to when not given", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "email_2" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ResendEmailClient("k", "from@gbam.app");
    await client.send({ to: "a@b.com", subject: "s", text: "t", html: "h" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty("reply_to");
  });

  it("throws EmailError with Resend's message on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { statusCode: 422, name: "validation_error", message: "Invalid `to` field." },
          { status: 422 },
        ),
      ),
    );
    const client = new ResendEmailClient("k", "from@gbam.app");
    const attempt = client.send({ to: "bad", subject: "s", text: "t", html: "h" });
    await expect(attempt).rejects.toBeInstanceOf(EmailError);
    await expect(attempt).rejects.toMatchObject({ message: "Invalid `to` field.", status: 422 });
  });
});

describe("FakeEmailClient", () => {
  it("logs the recipient, subject and text", async () => {
    const lines: string[] = [];
    const client = new FakeEmailClient((message) => lines.push(message));
    const result = await client.send({ to: "a@b.com", subject: "Hi", text: "code 1", html: "" });
    expect(lines.join("\n")).toContain("[fake email] → a@b.com: Hi");
    expect(lines.join("\n")).toContain("code 1");
    expect(result.id).toContain("fake-");
  });
});
