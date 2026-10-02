import prettier from "eslint-config-prettier";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

// Next ships its own React + typescript-eslint setup, so this extends it rather than
// @gbam/config/eslint (registering typescript-eslint twice makes ESLint error).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([".next/**", "next-env.d.ts"]),
]);
