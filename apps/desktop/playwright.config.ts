import { defineConfig } from "@playwright/test";

export default defineConfig({
  // GitHub 运行失败时，把具体用例和报错直接标在检查页；本地仍保留
  // 原来的简洁列表，避免再次只看到一个没有说明的退出码。
  reporter:
    process.env.GITHUB_ACTIONS === "true" ? [["github"], ["list"]] : "list",
  testDir: "e2e",
  timeout: 30_000,
  workers: 1,
  use: {
    trace: "retain-on-failure",
  },
});
