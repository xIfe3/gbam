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
    // Standalone scripts run by the deploy's migrate step: migrations, then content.
    // ESM only (they use import.meta.url to find ../migrations and ../content).
    entry: ["src/migrate.ts", "src/sync-content.ts"],
    format: ["esm"],
    sourcemap: true,
  },
]);
