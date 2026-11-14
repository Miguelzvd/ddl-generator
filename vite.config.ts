import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { chunkSizeWarningLimit: 20000 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
