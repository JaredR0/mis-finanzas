/**
 * Versión web: entrega el archivo con el menú "Compartir" del teléfono cuando
 * existe (en iPhone permite "Guardar en Archivos", AirDrop, etc.); si no, lo descarga.
 */
export async function saveAndShare(name: string, content: Uint8Array | string, mimeType: string): Promise<void> {
  const part = typeof content === 'string' ? content : new Uint8Array(content);
  const blob = new Blob([part], { type: mimeType });

  const nav = globalThis.navigator as Navigator | undefined;
  if (nav?.share && typeof File !== 'undefined') {
    const file = new File([blob], name, { type: mimeType });
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: name });
        return;
      } catch (error) {
        // El usuario cerró el menú: no se hace nada más.
        if (error instanceof Error && error.name === 'AbortError') return;
        // Otro problema (p. ej. el navegador no lo permitió): se descarga normal.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
