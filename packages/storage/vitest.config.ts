import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Windows CI 上并行运行多个 SQLite 文件测试时，单条恢复或并发测试可能超过默认的 5 秒。
    testTimeout: 15_000,
  },
});
