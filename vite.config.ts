import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
import fs from 'fs';

function copyPreloadPlugin() {
  return {
    name: 'copy-landrop-preload-cjs',
    closeBundle() {
      const src = path.resolve(__dirname, 'electron/preload.cjs');
      const destDir = path.resolve(__dirname, 'dist-electron');
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, path.join(destDir, 'preload.cjs'));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) {
          args.startup();
        },
        vite: {
          build: { outDir: 'dist-electron' },
          plugins: [copyPreloadPlugin()],
        },
      },
    ]),
    renderer(),
    // also copy on renderer rebuild in dev
    {
      name: 'copy-landrop-preload-on-dev',
      configureServer() {
        const src = path.resolve(__dirname, 'electron/preload.cjs');
        const destDir = path.resolve(__dirname, 'dist-electron');
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, path.join(destDir, 'preload.cjs'));
      },
      buildStart() {
        const src = path.resolve(__dirname, 'electron/preload.cjs');
        const destDir = path.resolve(__dirname, 'dist-electron');
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, path.join(destDir, 'preload.cjs'));
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5175,
  },
});
