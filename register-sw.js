/*
 * Mis Finanzas (versión web): registra el "service worker" que guarda una copia
 * de la app en el teléfono para que abra sin internet. No toca tus datos.
 */
(function () {
  var here = document.currentScript && document.currentScript.src;
  if ('serviceWorker' in navigator && here) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(new URL('sw.js', here).href).catch(function () {});
    });
  }
  // Pide al navegador que no borre los datos de la app por falta de espacio.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () {});
  }
})();
