import { defineConfig } from "tsup";

export default defineConfig((options) => [
  {
    // Dual output: CommonJS consumers require dist/index.cjs, ESM consumers import dist/index.js.
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    // Never wipe dist/ in watch mode: during `pnpm dev`, the API's tsc reads these .d.ts
    // files while the watcher is still rebuilding them.
    clean: !options.watch,
  },
  {
    // Standalone script run by the deploy's migrate step. ESM only (uses import.meta.url).
    entry: ["src/migrate.ts"],
    format: ["esm"],
    sourcemap: true,
  },
]);
