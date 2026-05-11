/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import packageJson from './package.json';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.GITHUB_ACTIONS === 'true' && repoName ? `/${repoName}/` : '/';

const readGitValue = (command: string) => {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
};

const buildInfo = {
  version: packageJson.version,
  branch: process.env.GITHUB_REF_NAME ?? readGitValue('git rev-parse --abbrev-ref HEAD'),
  commit: (process.env.GITHUB_SHA ?? readGitValue('git rev-parse HEAD')).slice(0, 7)
};

export default defineConfig({
  base,
  define: {
    __APP_BUILD_INFO__: JSON.stringify(buildInfo)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.svg', 'icons/icon-512.svg', 'icons/maskable-512.svg'],
      manifest: {
        name: 'Wheeled Robot Control',
        short_name: 'Wheeled Robot',
        description: 'Web Bluetooth controller for the Wheeled Robot ESP32-C6.',
        theme_color: '#1f6f5f',
        background_color: '#f5f1e8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base}icons/icon-192.svg`,
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: `${base}icons/icon-512.svg`,
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: `${base}icons/maskable-512.svg`,
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
