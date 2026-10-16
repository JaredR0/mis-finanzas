import * as ScreenCapture from "expo-screen-capture";
import { Platform } from "react-native";

/**
 * Oculta el contenido de la app fuera de ella:
 *  - iPhone: la vista previa del selector de apps aparece difuminada.
 *  - Android: la vista previa aparece en blanco y no se pueden tomar capturas de pantalla.
 */
export async function setScreenShield(on: boolean): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      if (on) await ScreenCapture.enableAppSwitcherProtectionAsync(1);
      else await ScreenCapture.disableAppSwitcherProtectionAsync();
    } else if (Platform.OS === "android") {
      if (on) await ScreenCapture.preventScreenCaptureAsync("mis-finanzas");
      else await ScreenCapture.allowScreenCaptureAsync("mis-finanzas");
    }
  } catch {
    // Si el sistema no lo admite, la app sigue funcionando sin esta capa.
  }
}
