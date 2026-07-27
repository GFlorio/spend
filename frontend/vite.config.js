import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// When GITHUB_PAGES=true the app is served from a subpath (e.g. /spend/).
const base = process.env.GITHUB_PAGES ? '/spend/' : '/';
const siteOrigin = process.env.SITE_ORIGIN ?? '';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw.js',
      manifest: {
        name: 'Spend',
        short_name: 'Spend',
        start_url: base,
        scope: base,
        id: '/spend/',
        display: 'standalone',
        background_color: '#f7fafc',
        theme_color: '#f7fafc',
        description: 'Local-first household budgeting',
        icons: [
          { src: `${base}icons/app-icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/app-icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: `${base}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        ...(siteOrigin && {
          related_applications: [
            { platform: 'webapp', url: `${siteOrigin}${base}manifest.webmanifest` },
          ],
        }),
      },
      includeAssets: ['/icons/*'],
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  build: { rollupOptions: { input: 'index.html' } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,ts}', 'src/**/*.integration.{js,ts}'],
    passWithNoTests: true,
  },
});
