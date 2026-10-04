import type { ArgumentsHost } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { DomainErrorsFilter } from "./domain-errors.filter.js";
import { TooManyRequestsError } from "./rate-limiter.js";

function run(retryAfterSeconds: number) {
  const out = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) {
      out.headers[name] = value;
    },
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new DomainErrorsFilter().catch(new TooManyRequestsError(retryAfterSeconds), host);
  return out;
}

describe("DomainErrorsFilter: TooManyRequestsError", () => {
  it("answers 429 with minutes rounded up and a Retry-After header", () => {
    const out = run(61);
    expect(out.status).toBe(429);
    expect(out.headers["Retry-After"]).toBe("61");
    expect(out.body).toMatchObject({
      message: "Too many attempts, try again in 2 minutes",
      retryAfterSeconds: 61,
    });
  });

  it("never says 0 minutes", () => {
    expect(run(5).body).toMatchObject({ message: "Too many attempts, try again in 1 minute" });
  });
});
