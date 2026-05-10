/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.GITHUB_ACTIONS === 'true' && repoName ? `/${repoName}/` : '/';

export default defineConfig({
  base,
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
