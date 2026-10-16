import { router } from "expo-router";
import { useState } from "react";
import { Platform } from "react-native";

import { amountToInput, parseAmount } from "@/core/money";
import { payFrequency } from "@/core/payCycle";
import { useDb, useToday } from "@/data/hooks";
import { pickDatabase } from "@/data/store";
import {
  PAY_AMOUNT_LABEL,
  PaySchedulePicker,
} from "@/features/shared/PaySchedulePicker";
import { exportBackup, pickBackup } from "@/services/backup";
import { requestReminderPermission } from "@/services/reminders";
import {
  Button,
  Card,
  ChoicePicker,
  confirm,
  FadeIn,
  Field,
  Group,
  haptic,
  MoneyField,
  notify,
  Screen,
  SectionTitle,
  Segmented,
  space,
  Txt,
  useColors,
} from "@/ui";
import { widgetAvailable } from "@/widget";

export default function SettingsScreen() {
  const db = useDb();
  const { settings } = db;
  const colors = useColors();
  const [payText, setPayText] = useState(
    amountToInput(
      payFrequency(settings) === "variable"
        ? (settings.incomeEstimate ?? 0)
        : settings.payAmount,
    ),
  );
  const today = useToday();
  const frequency = payFrequency(settings);
  const isVariable = frequency === "variable";

  const setReminders = async (on: boolean) => {
    if (!on) {
      db.setSettings({ remindersOn: false });
      return;
    }
    const granted = await requestReminderPermission();
    if (!granted) {
      notify(
        "Permiso necesario",
        "Activa las notificaciones de la app en los Ajustes del teléfono para recibir recordatorios.",
      );
      return;
    }
    haptic.success();
    db.setSettings({ remindersOn: true });
  };

  const backup = async () => {
    try {
      await exportBackup(pickDatabase(db));
    } catch (error) {
      notify(
        "No se pudo crear el respaldo",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const restore = async () => {
    try {
      const data = await pickBackup();
      if (!data) return;
      confirm({
        title: "¿Reemplazar todos tus datos?",
        message: `El respaldo tiene ${data.transactions.length} movimientos. Lo que hay ahora en la app se pierde.`,
        confirmLabel: "Restaurar",
        destructive: true,
        onConfirm: () => {
          // El bloqueo y el escudo de este teléfono no los cambia un archivo.
          db.replaceAll({
            ...data,
            settings: {
              ...data.settings,
              onboarded: true,
              lockEnabled: settings.lockEnabled,
              shieldScreen: settings.shieldScreen,
            },
          });
          haptic.success();
          notify("Respaldo restaurado");
        },
      });
    } catch (error) {
      notify(
        "No se pudo restaurar",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const erase = () =>
    confirm({
      title: "¿Borrar todo?",
      message:
        "Se eliminan cuentas, tarjetas, movimientos y ajustes. No se puede deshacer. Haz un respaldo antes si quieres conservarlos.",
      confirmLabel: "Borrar todo",
      destructive: true,
      onConfirm: () => {
        db.reset();
        router.replace("/bienvenida");
      },
    });

  return (
    <Screen title="Ajustes" back>
      <FadeIn>
        <SectionTitle title="Tu pago" />
        <Card style={{ gap: space.lg }}>
          <Group label="¿Cada cuánto te pagan?">
            <PaySchedulePicker
              value={{
                payDays: settings.payDays,
                payWeekly: settings.payWeekly,
              }}
              today={today}
              onChange={(next) => {
                const variable = next.payDays.length === 0 && !next.payWeekly;
                // Al pasar a ingreso variable (o volver), el monto escrito cambia de significado.
                if (variable !== isVariable)
                  setPayText(
                    amountToInput(
                      variable
                        ? (settings.incomeEstimate ?? 0)
                        : settings.payAmount,
                    ),
                  );
                db.setSettings({
                  payDays: next.payDays,
                  payWeekly: next.payWeekly,
                  ...(variable ? { payAmount: 0 } : {}),
                });
              }}
            />
          </Group>
          <Group label={PAY_AMOUNT_LABEL[frequency]}>
            <MoneyField
              value={payText}
              onChangeText={(value) => {
                setPayText(value);
                const cents = parseAmount(value) ?? 0;
                db.setSettings(
                  isVariable
                    ? { incomeEstimate: cents, payAmount: 0 }
                    : { payAmount: cents },
                );
              }}
            />
          </Group>
          {db.accounts.length > 0 ? (
            <Group label="Cuenta donde te depositan">
              <ChoicePicker
                choices={db.accounts.map((a) => ({
                  id: a.id,
                  label: a.name,
                  icon: a.kind === "efectivo" ? "cash" : "business",
                  color: a.color,
                }))}
                value={settings.payAccountId}
                onChange={(id) => id && db.setSettings({ payAccountId: id })}
              />
            </Group>
          ) : null}
        </Card>
      </FadeIn>

      {Platform.OS === "web" ? null : (
        <>
          <FadeIn index={1}>
            <SectionTitle title="Widget" />
            <Card style={{ gap: space.md }}>
              <Txt muted>
                Muestra en la pantalla de inicio del teléfono cuánto puedes
                gastar hoy. El monto cambia solo cada día, aunque no abras la
                app.
              </Txt>
              {widgetAvailable ? (
                <>
                  <Segmented
                    value={settings.widgetEnabled ? "on" : "off"}
                    onChange={(value) =>
                      db.setSettings({ widgetEnabled: value === "on" })
                    }
                    options={[
                      { value: "off", label: "Apagado" },
                      { value: "on", label: "Encendido" },
                    ]}
                  />
                  <Txt variant="small" muted>
                    {settings.widgetEnabled
                      ? Platform.OS === "ios"
                        ? "Para ponerlo: mantén presionada la pantalla de inicio → botón + → Mis Finanzas. Ese monto se ve sin abrir la app ni pasar por Face ID."
                        : "Para ponerlo: mantén presionada la pantalla de inicio → Widgets → Mis Finanzas. Ese monto se ve sin abrir la app ni pasar por el bloqueo."
                      : "Apagado, el widget no recibe ningún monto. Si lo enciendes, cualquiera que vea tu pantalla de inicio verá ese número."}
                  </Txt>
                </>
              ) : (
                <Txt variant="small" muted>
                  Esta instalación no incluye el widget. Se agrega al compilar
                  la app: los pasos están en el archivo README, sección
                  “Widget”.
                </Txt>
              )}
            </Card>
          </FadeIn>

          <FadeIn index={1}>
            <SectionTitle title="Recordatorios" />
            <Card style={{ gap: space.md }}>
              <Txt muted>
                Te avisa 3 días antes y el mismo día de cada pago de tarjeta,
                gasto fijo y deuda.
              </Txt>
              <Segmented
                value={settings.remindersOn ? "on" : "off"}
                onChange={(value) => setReminders(value === "on")}
                options={[
                  { value: "on", label: "Activados" },
                  { value: "off", label: "Desactivados" },
                ]}
              />
            </Card>
          </FadeIn>
        </>
      )}

      <FadeIn index={2}>
        <SectionTitle title="Moneda" />
        <Card style={{ gap: space.lg }}>
          <Group label="Símbolo">
            <Field
              value={settings.currency}
              onChangeText={(value) =>
                db.setSettings({ currency: value.slice(0, 3) })
              }
              maxLength={3}
              autoCapitalize="characters"
            />
          </Group>
        </Card>
      </FadeIn>

      <FadeIn index={3}>
        <SectionTitle title="Respaldo" />
        <Card style={{ gap: space.md }}>
          <Txt muted>
            Tus datos viven solo en este teléfono, cifrados. Guarda un respaldo
            de vez en cuando.
          </Txt>
          <Txt variant="small" color={colors.warning}>
            El archivo de respaldo no va cifrado: quien lo abra puede leer tus
            movimientos. Guárdalo en un lugar privado y no lo envíes por chat o
            correo.
          </Txt>
          <Button
            variant="soft"
            icon="cloud-upload-outline"
            label="Crear respaldo"
            onPress={backup}
          />
          <Button
            variant="ghost"
            icon="cloud-download-outline"
            label="Restaurar un respaldo"
            onPress={restore}
          />
        </Card>
      </FadeIn>

      <SectionTitle title="Zona de cuidado" />
      <Button
        variant="danger"
        icon="trash-outline"
        label="Borrar todos los datos"
        onPress={erase}
      />
    </Screen>
  );
}
