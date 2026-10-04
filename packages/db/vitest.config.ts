import { defineConfig } from "vitest/config";

export default defineConfig({
  // The content tests read and parse every Markdown file. That takes ~2s on a quiet machine
  // but can pass the default 5s limit while the full turbo build (or `pnpm dev`) runs too.
  test: { include: ["src/**/*.test.ts"], testTimeout: 30_000 },
});
