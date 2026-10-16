/**
 * Regla: la app no habla con internet.
 *
 * La app no tiene código de red propio. Este guardia es la segunda capa: en la
 * versión instalada reemplaza las tres puertas de red de JavaScript (fetch,
 * XMLHttpRequest y WebSocket) por versiones que siempre fallan, de modo que si
 * una librería intentara enviar o recibir algo, no puede.
 *
 * En desarrollo no se instala, porque la herramienta de desarrollo necesita la
 * red local para cargar el código.
 */

export class NetworkBlockedError extends Error {
  constructor(what: string) {
    super(`Red bloqueada: Mis Finanzas no se conecta a internet (${what}).`);
    this.name = "NetworkBlockedError";
  }
}

type NetworkGlobals = {
  fetch?: unknown;
  XMLHttpRequest?: unknown;
  WebSocket?: unknown;
  EventSource?: unknown;
  navigator?: { sendBeacon?: unknown } | undefined;
};

let attempts = 0;

/** Cuántas veces algo intentó usar la red desde que abrió la app (debería ser siempre 0). */
export const blockedAttempts = (): number => attempts;

export function installNetworkGuard(target: NetworkGlobals): void {
  const refuse = (what: string) => {
    attempts++;
    return new NetworkBlockedError(what);
  };
  const blockedClass = (what: string) =>
    class {
      constructor() {
        throw refuse(what);
      }
    };

  const lock = (name: keyof NetworkGlobals, value: unknown) => {
    try {
      Object.defineProperty(target, name, {
        value,
        writable: false,
        configurable: false,
        enumerable: true,
      });
    } catch {
      (target as Record<string, unknown>)[name] = value;
    }
  };

  lock("fetch", () => Promise.reject(refuse("fetch")));
  lock("XMLHttpRequest", blockedClass("XMLHttpRequest"));
  lock("WebSocket", blockedClass("WebSocket"));
  lock("EventSource", blockedClass("EventSource"));
  if (target.navigator && typeof target.navigator === "object") {
    try {
      target.navigator.sendBeacon = () => {
        attempts++;
        return false;
      };
    } catch {
      // navigator de solo lectura: no hay sendBeacon que bloquear.
    }
  }
}
