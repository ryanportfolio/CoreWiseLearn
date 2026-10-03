import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readdirSync } from 'node:fs';

// Served from GitHub Pages at https://<owner>.github.io/CoreWiseLearn/
const BASE = '/CoreWiseLearn/';

export default defineConfig({
  base: BASE,
  define: {
    __MUSIC_FILES__: JSON.stringify(readdirSync(new URL('./public/music/', import.meta.url)).filter(name => /\.(mp3|ogg)$/.test(name))),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    // Scratch writes under .tmp (screenshots, probe scripts, other agents' notes)
    // must not reload every open dev page.
    watch: { ignored: ['**/.tmp/**', '**/.playwright-mcp/**', '**/D:/**'] },
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'fonts/OFL.txt'],
      manifest: {
        name: 'CoreWise Learn',
        short_name: 'CoreWise',
        description: 'Browser games for small children.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        theme_color: '#1b1f3b',
        background_color: '#1b1f3b',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache every built asset so the hub works offline after the first load.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webp,mp3,ogg,wav,json,woff2,ttf,txt,md}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        cacheId: 'cwl.v1',
      },
    }),
  ],
});
