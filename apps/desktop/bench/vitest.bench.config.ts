import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["apps/desktop/bench/**/*.test.ts"] } });
