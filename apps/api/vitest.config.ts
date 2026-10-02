import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Vitest's default transform (esbuild) drops decorator metadata, which breaks Nest DI.
// SWC emits it, so tests resolve providers exactly like the tsc build does.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    // Integration tests share one Postgres; keep them sequential.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
