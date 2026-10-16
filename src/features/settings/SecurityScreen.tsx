import Ionicons from "@expo/vector-icons/Ionicons";
import { Platform, StyleSheet, View } from "react-native";

import { useDb } from "@/data/hooks";
import { useStorageHealth } from "@/data/storage";
import { authenticate, lockSupport } from "@/security/lock";
import { blockedAttempts } from "@/security/networkGuard";
import { changePin } from "@/security/webVault";
import {
  Button,
  Card,
  FadeIn,
  haptic,
  type IconName,
  notify,
  Screen,
  SectionTitle,
  Segmented,
  space,
  Txt,
  useColors,
} from "@/ui";
import { widgetAvailable } from "@/widget";

type Tone = "ok" | "warn";

const WEB = Platform.OS === "web";

/** Seguridad y privacidad: qué protege la app, en qué estado está y los ajustes de bloqueo. */
export default function SecurityScreen() {
  const colors = useColors();
  const db = useDb();
  const health = useStorageHealth();
  const { settings } = db;
  const blocked = blockedAttempts();

  const facts: { icon: IconName; tone: Tone; title: string; text: string }[] = [
    __DEV__
      ? {
          icon: "cloud-offline",
          tone: "warn",
          title: "Sin internet (modo desarrollo)",
          text: "En esta versión de desarrollo la red local sigue abierta para cargar el código. En la versión instalada queda cerrada.",
        }
      : WEB
        ? {
            icon: "cloud-offline",
            tone: blocked === 0 ? "ok" : "warn",
            title: "Tus datos no salen del teléfono",
            text:
              blocked === 0
                ? "Del internet solo se descarga la app (desde GitHub). Lo que anotas nunca se envía: las puertas de red de la app están cerradas y nada ha intentado usarlas."
                : `Las puertas de red están cerradas. Algo intentó usarlas ${blocked} ${blocked === 1 ? "vez" : "veces"} y fue bloqueado.`,
          }
        : {
            icon: "cloud-offline",
            tone: blocked === 0 ? "ok" : "warn",
            title: "Sin conexión a internet",
            text:
              blocked === 0
                ? "La app no envía ni recibe nada. Las puertas de red están cerradas y nada ha intentado usarlas."
                : `Las puertas de red están cerradas. Algo intentó usarlas ${blocked} ${blocked === 1 ? "vez" : "veces"} y fue bloqueado.`,
          },
    health.mode === "cifrado" && WEB
      ? {
          icon: "lock-closed",
          tone: "ok",
          title: "Datos cifrados con tu PIN",
          text: "Todo se guarda cifrado en este teléfono. Sin tu PIN no se puede leer. El PIN no se guarda en ningún lado: si lo olvidas, los datos no se pueden recuperar.",
        }
      : health.mode === "cifrado"
        ? {
            icon: "lock-closed",
            tone: "ok",
            title: "Datos cifrados",
            text: "Todo se guarda cifrado. La llave vive en el llavero del teléfono, solo se puede usar con el teléfono desbloqueado y no sale de este dispositivo.",
          }
        : {
            icon: "lock-open",
            tone: "warn",
            title: "Datos sin cifrar",
            text: "Este dispositivo no ofrece un llavero seguro, así que los datos se guardan sin cifrar. En iPhone y Android siempre se cifran.",
          },
    {
      icon: "eye-off",
      tone: "ok",
      title: "Sin cuentas, sin rastreo",
      text: "No hay registro, anuncios ni analíticas. Nadie más que tú ve lo que anotas.",
    },
    {
      icon: "card",
      tone: "ok",
      title: "Solo lo necesario",
      text: "De tus tarjetas no se guarda ningún número: solo el nombre que tú les pones y sus fechas. Tampoco códigos de seguridad ni claves del banco.",
    },
    {
      icon: "share-outline",
      tone: "ok",
      title: "Nada sale sin que lo pidas",
      text: "Lo único que sale de la app es el Excel o el respaldo, y solo cuando tú tocas el botón y eliges a dónde va.",
    },
  ];
  if (WEB) {
    facts.push({
      icon: "save-outline",
      tone: "warn",
      title: "Guarda respaldos",
      text: "Los datos viven en el navegador de este teléfono. Si borras el historial y los datos de Safari, o quitas la app de la pantalla de inicio, se pierden. Haz un respaldo de vez en cuando (Ajustes → Respaldo).",
    });
  }
  if (widgetAvailable && settings.widgetEnabled) {
    facts.push({
      icon: "apps-outline",
      tone: "warn",
      title: "Widget encendido",
      text: "Lo que puedes gastar hoy se ve en la pantalla de inicio del teléfono, sin pasar por el bloqueo de la app. Se apaga en Ajustes → Widget.",
    });
  }

  const setLock = async (on: boolean) => {
    if (on === settings.lockEnabled) return;
    if (on && (await lockSupport()) === "sin_codigo") {
      notify(
        "Tu teléfono no tiene código",
        "Configura un código, Face ID o huella en los Ajustes del teléfono y vuelve a intentar.",
      );
      return;
    }
    // Para activar o desactivar hay que demostrar que eres el dueño del teléfono.
    if (
      !(await authenticate(
        on
          ? "Activar el bloqueo de Mis Finanzas"
          : "Desactivar el bloqueo de Mis Finanzas",
      ))
    )
      return;
    haptic.success();
    db.setSettings({ lockEnabled: on });
  };

  return (
    <Screen title="Seguridad" subtitle="Cómo se protege tu información" back>
      {health.setAside ? (
        <Card
          style={{
            borderColor: colors.warning,
            backgroundColor: colors.warningSoft,
            gap: space.xs,
            marginBottom: space.lg,
          }}
        >
          <Txt variant="bodyStrong">Se encontraron datos de otro teléfono</Txt>
          <Txt variant="small" muted>
            Estaban cifrados con una llave que no existe en este dispositivo,
            así que no se pueden abrir. Se apartaron sin borrarlos. Para
            recuperar tu información usa Ajustes → Restaurar un respaldo.
          </Txt>
        </Card>
      ) : null}

      <FadeIn>
        <Card style={{ gap: space.lg }}>
          {facts.map((fact) => {
            const tint = fact.tone === "ok" ? colors.positive : colors.warning;
            return (
              <View key={fact.title} style={styles.fact}>
                <View
                  style={[
                    styles.factIcon,
                    {
                      backgroundColor:
                        fact.tone === "ok"
                          ? colors.positiveSoft
                          : colors.warningSoft,
                    },
                  ]}
                >
                  <Ionicons name={fact.icon} size={18} color={tint} />
                </View>
                <View style={styles.flex}>
                  <Txt variant="bodyStrong">{fact.title}</Txt>
                  <Txt variant="small" muted>
                    {fact.text}
                  </Txt>
                </View>
              </View>
            );
          })}
        </Card>
      </FadeIn>

      {WEB ? (
        <FadeIn index={1}>
          <SectionTitle title="PIN" />
          <Card style={{ gap: space.md }}>
            <Txt muted>
              Se pide al abrir la app y al volver después de un minuto fuera.
              También cifra tus datos.
            </Txt>
            <Button
              variant="soft"
              icon="key-outline"
              label="Cambiar PIN"
              onPress={() =>
                void changePin().then((ok) => {
                  if (ok) {
                    haptic.success();
                    notify("PIN cambiado");
                  }
                })
              }
            />
          </Card>
        </FadeIn>
      ) : (
        <>
          <FadeIn index={1}>
            <SectionTitle title="Bloqueo de la app" />
            <Card style={{ gap: space.md }}>
              <Txt muted>
                Pide Face ID, huella o el código del teléfono al abrir la app y
                al volver después de un minuto fuera.
              </Txt>
              <Segmented
                value={settings.lockEnabled ? "on" : "off"}
                onChange={(value) => void setLock(value === "on")}
                options={[
                  { value: "on", label: "Activado" },
                  { value: "off", label: "Desactivado" },
                ]}
              />
            </Card>
          </FadeIn>

          <FadeIn index={2}>
            <SectionTitle title="Ocultar al salir" />
            <Card style={{ gap: space.md }}>
              <Txt muted>
                Difumina la app en el selector de aplicaciones para que nadie
                vea tus saldos de reojo. En Android además impide las capturas
                de pantalla.
              </Txt>
              <Segmented
                value={settings.shieldScreen ? "on" : "off"}
                onChange={(value) =>
                  db.setSettings({ shieldScreen: value === "on" })
                }
                options={[
                  { value: "on", label: "Activado" },
                  { value: "off", label: "Desactivado" },
                ]}
              />
            </Card>
          </FadeIn>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  fact: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  factIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});
