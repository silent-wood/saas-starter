import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    // e2e 不走 main.ts，必须在用例求值前把 .env 读进 process.env，
    // 否则 prisma.service 顶层拿不到 DATABASE_URL（详见该文件注释）
    setupFiles: ['./test/setup-env.ts'],
    include: ['**/*.e2e-spec.ts'],
  },
});
