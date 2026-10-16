import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Bloqueo de la app con la seguridad del propio teléfono: Face ID o huella y,
 * si fallan, el código del teléfono. La app nunca ve ni guarda esos datos:
 * el sistema solo le responde "sí" o "no".
 */

export type LockSupport = 'disponible' | 'sin_codigo';

/** 'sin_codigo' = el teléfono no tiene código ni biometría configurados. */
export async function lockSupport(): Promise<LockSupport> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level === LocalAuthentication.SecurityLevel.NONE ? 'sin_codigo' : 'disponible';
}

export async function authenticate(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancelar',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
