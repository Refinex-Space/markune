import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Markweave 会 import katex/mermaid 等 CSS；测试环境下重定向到空模块。
const cssStub = {
  name: 'css-stub',
  resolveId(source: string) {
    if (source.endsWith('.css')) {
      return { id: '\0css-stub' };
    }
    return undefined;
  },
  load(id: string) {
    if (id === '\0css-stub') {
      return { code: 'export default ""' };
    }
    return undefined;
  },
};

export default defineConfig({
  plugins: [react(), cssStub],
  resolve: {
    alias: {
      '@': dirname,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['components/**/*.test.{ts,tsx}'],
    // Markweave 的 math/mermaid 插件 import CSS；强制 Vite 转换相关包，
    // 让 cssStub 插件能拦截 .css 导入。
    server: {
      deps: {
        inline: ['@markweave/react', 'markweave'],
      },
    },
  },
});
