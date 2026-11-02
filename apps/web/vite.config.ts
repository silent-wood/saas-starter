import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  css: {
    preprocessorOptions: {
      less: {
        additionalData: `@import ${path.resolve(__dirname, 'src/styles/variables.less')};`,
      },
    },
  },
  build: {
    // https://vitejs.dev/config/build-options.html#build-ssr
    rollupOptions: {
      output: {
        // Vite 8（rolldown）移除了 manualChunks 的对象写法，只剩函数形式：
        // 返回 chunk 名 → 归入该 chunk；返回 undefined → 交给默认分包策略
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/node_modules\/(antd|@ant-design)\//.test(id)) return 'antd';
          if (/node_modules\/(react|react-dom|react-router)\//.test(id)) return 'react';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
