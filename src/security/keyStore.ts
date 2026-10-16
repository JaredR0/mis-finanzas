import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import { fromBase64, toBase64 } from './seal';
import type { KeyStore } from './secureStorage';

/**
 * La llave de cifrado vive en el llavero del sistema (Keychain en iPhone,
 * Keystore en Android), no junto a los datos:
 *  - solo se puede leer con el teléfono desbloqueado;
 *  - no sale del dispositivo: no se copia a iCloud ni a otro teléfono.
 */

const KEY_NAME = 'mis-finanzas.llave-datos.v1';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Números aleatorios del sistema operativo (criptográficamente seguros). */
export const randomBytes = (count: number): Uint8Array => Crypto.getRandomBytes(count);

export const keyStore: KeyStore = {
  available: () => SecureStore.isAvailableAsync(),
  load: async () => {
    const stored = await SecureStore.getItemAsync(KEY_NAME, OPTIONS);
    if (stored) return fromBase64(stored);
    // "No hay llave" solo es confiable con la app en primer plano y el teléfono desbloqueado.
    if (AppState.currentState !== 'active') throw new Error('el llavero no está disponible con el teléfono bloqueado');
    return null;
  },
  save: (key) => SecureStore.setItemAsync(KEY_NAME, toBase64(key), OPTIONS),
};
