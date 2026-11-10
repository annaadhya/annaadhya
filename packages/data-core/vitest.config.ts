import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      "@annaadhya/utils": fileURLToPath(new URL("../utils/src/index.ts", import.meta.url)),
      "@annaadhya/contracts": fileURLToPath(new URL("../contracts/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
