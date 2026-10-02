import { defineConfig } from "tsup";

// Dual output: CommonJS consumers require dist/index.cjs, ESM consumers import dist/index.js.
export default defineConfig((options) => ({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  // Never wipe dist/ in watch mode: during `pnpm dev`, the API's tsc reads these .d.ts
  // files while the watcher is still rebuilding them.
  clean: !options.watch,
}));
