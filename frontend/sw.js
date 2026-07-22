import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();
cleanupOutdatedCaches();

registerRoute(
  ({ request, url }) => request.method === 'GET' && url.origin === self.location.origin,
  new StaleWhileRevalidate({ cacheName: 'spend-app' }),
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') { self.skipWaiting(); }
});
