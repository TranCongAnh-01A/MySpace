import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/.claude/**'] },
  },
  build: {
    target: 'chrome105',
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        'quick-capture': resolve(import.meta.dirname, 'quick-capture.html'),
      },
      output: {
        // Tách thư viện nặng thành chunk riêng. Thư viện dùng chung (react, radix, floating-ui)
        // phải gom tường minh, nếu không chúng bị nhét vào chunk tiptap/fullcalendar và
        // chunk chính sẽ kéo cả hai về ngay lúc khởi động.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
              priority: 40,
            },
            {
              name: 'ui',
              test: /node_modules[\\/](@radix-ui|@floating-ui|react-remove-scroll|aria-hidden|cmdk|sonner)/,
              priority: 30,
            },
            {
              name: 'fullcalendar',
              test: /node_modules[\\/](@fullcalendar|luxon|preact)/,
              priority: 20,
            },
            { name: 'lowlight', test: /node_modules[\\/](lowlight|highlight\.js)/, priority: 20 },
            {
              name: 'tiptap',
              test: /node_modules[\\/](@tiptap|prosemirror[^\\/]*|orderedmap|rope-sequence|w3c-keyname|crelt|linkifyjs)/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
