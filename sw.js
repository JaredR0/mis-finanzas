/*
 * Mis Finanzas (versión web) — service worker.
 *
 * Solo guarda una copia de los archivos de la app (código, íconos, fuentes) para
 * que abra sin internet. Nunca ve ni envía tus datos: esos viven cifrados en el
 * almacenamiento del navegador, no pasan por aquí.
 *
 *  - Página: primero intenta la versión más nueva (así llegan las actualizaciones);
 *    sin internet usa la copia guardada.
 *  - Código e imágenes (con huella en el nombre): se usan de la copia guardada.
 */
var CACHE = 'mis-finanzas-app-v1';
var SCOPE = self.registration.scope;
var SHELL = [SCOPE, SCOPE + 'index.html', SCOPE + 'manifest.webmanifest', SCOPE + 'icons/apple-touch-icon.png', SCOPE + 'icons/icon-192.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names
            .filter(function (name) {
              return name !== CACHE;
            })
            .map(function (name) {
              return caches.delete(name);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error('timeout'));
    }, ms);
    promise.then(
      function (value) {
        clearTimeout(timer);
        resolve(value);
      },
      function (error) {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Al guardar un código nuevo de la app, borra el de versiones anteriores. */
function pruneOldBundles(cache, keepUrl) {
  if (keepUrl.indexOf('/_expo/static/js/') === -1) return Promise.resolve();
  return cache.keys().then(function (requests) {
    return Promise.all(
      requests
        .filter(function (request) {
          return request.url.indexOf('/_expo/static/js/') !== -1 && request.url !== keepUrl;
        })
        .map(function (request) {
          return cache.delete(request);
        }),
    );
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET' || request.url.indexOf(SCOPE) !== 0) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      withTimeout(fetch(request), 5000)
        .then(function (response) {
          // GitHub Pages responde las rutas internas con 404.html (la misma app).
          if (response.ok) {
            var copy = response.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put(SCOPE + 'index.html', copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(SCOPE + 'index.html').then(function (cached) {
            return cached || caches.match(SCOPE);
          });
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(request, copy).then(function () {
              return pruneOldBundles(cache, request.url);
            });
          });
        }
        return response;
      });
    }),
  );
});
