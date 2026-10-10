import { afterEach, describe, expect, it, vi } from "vitest";
import { appEnv, isStaging } from "./app-env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("which copy of Gbam this is", () => {
  it("staging when NEXT_PUBLIC_APP_ENV says so", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    expect(appEnv()).toBe("staging");
    expect(isStaging()).toBe(true);
  });

  it("otherwise production for a production build, development when running locally", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(appEnv()).toBe("production");
    expect(isStaging()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(appEnv()).toBe("development");
  });
});
