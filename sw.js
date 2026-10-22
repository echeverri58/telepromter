/* ============================================================================
 *  sw.js — Service Worker del Teleprompter
 *
 *  Estrategia:
 *   · Precachea todos los archivos de la app al instalar (para funcionar offline).
 *   · Cache-first para los recursos estáticos (HTML, CSS, JS, iconos).
 *   · Network-first solo para las navegaciones, con caída al index.html cacheado.
 *   · Borra las cachés de versiones anteriores al activarse.
 *
 *  NOTA IMPORTANTE SOBRE LA CÁMARA
 *  El vídeo de la cámara NUNCA pasa por aquí: getUserMedia() entrega un
 *  MediaStream, que no es una petición HTTP. Los objetos URL (blob:) del vídeo
 *  grabado tampoco se pueden interceptar: un service worker solo actúa sobre
 *  peticiones http(s) de su propio origen. Por eso este archivo no cachea ni
 *  toca el stream en ningún momento.
 *
 *  ¿Has cambiado algún archivo de la app? Sube VERSION (por ejemplo 1.0.1)
 *  para que los usuarios reciban la actualización.
 * ========================================================================== */

const VERSION = '1.3.0';
const CACHE_NAME = `teleprompter-${VERSION}`;

// Rutas RELATIVAS: GitHub Pages sirve la app desde /nombre-del-repo/.
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg'
];

/* ------------------------------------------------------------------ instalación */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // cache: 'reload' evita quedarse con copias viejas del caché HTTP.
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })()
  );
});

/* -------------------------------------------------------------------- activación */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('teleprompter-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

/* ------------------------------------------------------------------------- fetch */
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Solo peticiones GET http(s) de nuestro origen.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones: intenta red, cae al index cacheado (offline).
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Recursos estáticos: primero caché.
  event.respondWith(cacheFirst(request));
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put('./index.html', response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (await cache.match('./index.html'));
    if (cached) return cached;
    return new Response(
      '<!DOCTYPE html><html lang="es"><meta charset="utf-8"><title>Sin conexión</title>' +
        '<body style="background:#0b0f14;color:#eef3f9;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">' +
        '<p>Sin conexión. Abre la app una vez con internet para poder usarla offline.</p></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Solo guardamos respuestas propias y correctas.
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Sin conexión y sin copia: dejamos que el navegador muestre el error.
    return new Response('', { status: 504, statusText: 'Sin conexión' });
  }
}
