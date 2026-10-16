import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Backend } from '@/security/secureStorage';

/**
 * Dónde se guardan físicamente los datos (ya cifrados): el almacenamiento
 * privado de la app en el teléfono. Para cambiar a SQLite u otro destino,
 * basta con exportar aquí otro objeto con estos tres métodos.
 */
export const backend: Backend = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
};
