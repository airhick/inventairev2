import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  base: './',
  build: {
    outDir: resolve(rootDir, '../dist-lite'),
    emptyOutDir: true,
  },
});
