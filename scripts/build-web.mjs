#!/usr/bin/env node
/**
 * Construye la versión web (para GitHub Pages) en la carpeta dist-web/.
 *
 *   npm run web:build
 *
 * 1. Exporta la app para web con Expo (usa experiments.baseUrl de app.json, p. ej. /mis-finanzas).
 * 2. Agrega a index.html lo necesario para instalarla en el iPhone (ícono, pantalla
 *    completa), la regla de seguridad que solo deja cargar archivos de la propia
 *    dirección (CSP) y el registro del service worker para que abra sin internet.
 * 3. Crea 404.html (GitHub Pages lo usa para las rutas internas) y .nojekyll
 *    (sin él, GitHub Pages esconde la carpeta _expo).
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-web');
const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
const base = (app.experiments?.baseUrl ?? '').replace(/\/$/, '');

rmSync(out, { recursive: true, force: true });
execSync(`npx expo export --platform web --output-dir dist-web`, { cwd: root, stdio: 'inherit' });

const indexPath = join(out, 'index.html');
let html = readFileSync(indexPath, 'utf8');

// Solo se carga lo que viene de esta misma dirección; nada puede enviarse a otro sitio.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const head = [
  `<meta name="referrer" content="no-referrer" />`,
  `<meta name="robots" content="noindex, nofollow" />`,
  `<meta name="apple-mobile-web-app-capable" content="yes" />`,
  `<meta name="mobile-web-app-capable" content="yes" />`,
  `<meta name="apple-mobile-web-app-title" content="Mis Finanzas" />`,
  `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`,
  `<meta name="format-detection" content="telephone=no" />`,
  `<link rel="apple-touch-icon" href="${base}/icons/apple-touch-icon.png" />`,
  `<link rel="manifest" href="${base}/manifest.webmanifest" />`,
  `<script src="${base}/register-sw.js" defer></script>`,
].join('\n    ');

html = html
  .replace('<html lang="en">', '<html lang="es">')
  .replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />')
  .replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
  .replace('</head>', `    ${head}\n  </head>`);

if (!html.includes('Content-Security-Policy') || !html.includes('viewport-fit=cover')) {
  throw new Error('No se pudo preparar index.html (¿cambió el formato de Expo?).');
}
for (const file of ['manifest.webmanifest', 'sw.js', 'register-sw.js', 'icons/apple-touch-icon.png']) {
  if (!existsSync(join(out, file))) throw new Error(`Falta ${file} en dist-web (debe estar en public/).`);
}

writeFileSync(indexPath, html);
copyFileSync(indexPath, join(out, '404.html'));
writeFileSync(join(out, '.nojekyll'), '');
console.log(`\n✔ Versión web lista en dist-web/ (dirección base: ${base || '/'})`);
