import { defineConfig } from "tsup";

// Dual output: NestJS (CommonJS) requires dist/index.cjs, Next.js imports dist/index.js.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
