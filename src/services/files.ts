import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Guarda un archivo temporal y abre la hoja de compartir del sistema.
 * Es la única forma en que un dato sale de la app, y solo cuando el usuario lo pide y elige el destino.
 */
export async function saveAndShare(name: string, content: Uint8Array | string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Este dispositivo no permite compartir archivos.');
    }
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
  } finally {
    // La copia temporal no se queda en el teléfono: se borra al cerrar la hoja de compartir.
    try {
      if (file.exists) file.delete();
    } catch {
      // Si el sistema ya la limpió, no hay nada que hacer.
    }
  }
}

/** Deja al usuario elegir un archivo y devuelve su texto; null si canceló. */
export async function pickTextFile(): Promise<string | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain'] });
  if (picked.canceled) return null;
  return picked.result.text();
}
