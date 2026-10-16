import "@/security/install";

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Appearance, Platform } from "react-native";

import { autoFixedDrafts } from "@/core/autoFixed";
import { widgetSnapshot } from "@/core/widget";
import { useHydrated, useToday } from "@/data/hooks";
import { useStorageHealth } from "@/data/storage";
import { pickDatabase, useStore } from "@/data/store";
import { UndoBar } from "@/features/shared/UndoBar";
import { AppLock } from "@/security/AppLock";
import { PinPrompt } from "@/security/PinPrompt";
import { StorageErrorScreen } from "@/security/StorageErrorScreen";
import { syncReminders } from "@/services/reminders";
import { useColors, useIsDark } from "@/ui";
import { syncWidget, widgetAvailable } from "@/widget";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Formularios: suben desde abajo, dentro de la misma ventana (así el bloqueo siempre los cubre). */
const FORMS = [
  "movimiento",
  "tarjeta",
  "apartado",
  "deuda",
  "fijo",
  "cuenta",
  "categoria",
  "cuota",
  "ingreso-extra",
  "gasto-planeado",
] as const;

export default function RootLayout() {
  const isDark = useIsDark();
  const colors = useColors();
  const hydrated = useHydrated();
  const health = useStorageHealth();
  const today = useToday();
  const db = useStore();
  const failed = !hydrated && health.error !== null;

  useEffect(() => {
    if (hydrated || failed) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated, failed]);

  // Teclado, alertas y demás piezas del sistema siguen el tema elegido en Apariencia.
  const themeChoice = db.settings.theme;
  useEffect(() => {
    try {
      Appearance.setColorScheme(
        themeChoice === "claro"
          ? "light"
          : themeChoice === "oscuro"
            ? "dark"
            : "unspecified",
      );
    } catch {
      // Si el sistema no lo admite, la app igual usa sus propios colores.
    }
  }, [themeChoice]);

  // Mantiene los recordatorios al día con los datos (sin bloquear la pantalla).
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      syncReminders(pickDatabase(db), today).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [hydrated, db, today]);

  // Gastos fijos que se cobran solos: se registran al llegar su día.
  useEffect(() => {
    if (!hydrated) return;
    for (const draft of autoFixedDrafts(
      pickDatabase(useStore.getState()),
      today,
    ))
      useStore.getState().addTx(draft);
  }, [hydrated, today, db.fixedExpenses, db.transactions]);

  // Le pasa al widget solo los números que muestra; si está apagado, se los borra.
  const widgetOn = db.settings.widgetEnabled;
  useEffect(() => {
    if (!hydrated || !widgetAvailable) return;
    const timer = setTimeout(() => {
      syncWidget(
        widgetOn ? widgetSnapshot(pickDatabase(db), today) : null,
      ).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [hydrated, db, today, widgetOn]);

  // Versión web: la pantalla del PIN puede aparecer antes de abrir los datos (para descifrarlos).
  const pinLayer = Platform.OS === "web" ? <PinPrompt /> : null;

  if (failed)
    return (
      <StorageErrorScreen
        message={health.error ?? ""}
        onRetry={() => void useStore.persist.rehydrate()}
      />
    );
  if (!hydrated) return pinLayer;

  const base = isDark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AppLock>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="bienvenida"
            options={{ animation: "fade", gestureEnabled: false }}
          />
          {FORMS.map((name) => (
            <Stack.Screen
              key={name}
              name={name}
              options={{ animation: "slide_from_bottom" }}
            />
          ))}
        </Stack>
        <UndoBar />
      </AppLock>
      {pinLayer}
    </ThemeProvider>
  );
}
