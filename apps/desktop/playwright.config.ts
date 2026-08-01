import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: "list",
  testDir: "e2e",
  timeout: 30_000,
  workers: 1,
  use: {
    trace: "retain-on-failure",
  },
});
