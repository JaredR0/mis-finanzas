import { installNetworkGuard } from './networkGuard';

/**
 * Se ejecuta antes que cualquier otra cosa de la app (es la primera línea de
 * `app/_layout.tsx`). En la versión instalada cierra las puertas de red.
 */
if (!__DEV__) {
  installNetworkGuard(globalThis as unknown as Parameters<typeof installNetworkGuard>[0]);
}
