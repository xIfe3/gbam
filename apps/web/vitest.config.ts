import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Same "@/" alias as tsconfig.json
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    // 15 seconds per test (the default is 5): on a busy machine, like CI running everything
    // at once, rendering a big page can take longer than 5 seconds without anything wrong.
    testTimeout: 15_000,
    // Two "projects" (groups of test files with their own settings), run together.
    // `extends: true` means each also gets the plugins and alias above.
    projects: [
      {
        // Plain .ts tests (server code, actions, file checks) run in Node: fast, and
        // import.meta.url is a real file path there.
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts"],
        },
      },
      {
        // Component tests (.tsx) need a fake browser DOM, which jsdom provides.
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
