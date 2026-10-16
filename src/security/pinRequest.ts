import { useSyncExternalStore } from "react";

/**
 * Puente entre la lógica que necesita un PIN (abrir los datos, desbloquear,
 * cambiar el PIN) y la pantalla que lo pide (PinPrompt). Solo se usa en la versión web.
 */

export type PinKind = "crear" | "abrir" | "verificar";

export interface PinRequest {
  id: number;
  kind: PinKind;
  title?: string;
  reason?: string;
  /** Si existe, la pantalla valida el PIN y solo termina cuando es correcto (o se cancela). */
  check?: (pin: string) => Promise<boolean>;
  cancellable: boolean;
  resolve: (pin: string | null) => void;
}

let current: PinRequest | null = null;
let seq = 0;
const queue: PinRequest[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function requestPin(
  kind: PinKind,
  options: {
    title?: string;
    reason?: string;
    check?: (pin: string) => Promise<boolean>;
    cancellable?: boolean;
  } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    const req: PinRequest = {
      id: ++seq,
      kind,
      ...options,
      cancellable: options.cancellable ?? false,
      resolve,
    };
    if (current) queue.push(req);
    else current = req;
    emit();
  });
}

/** La pantalla del PIN termina la petición actual (null = cancelada). */
export function finishPinRequest(pin: string | null): void {
  const done = current;
  current = queue.shift() ?? null;
  emit();
  done?.resolve(pin);
}

export function usePinRequest(): PinRequest | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
