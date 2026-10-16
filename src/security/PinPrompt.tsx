import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Button, confirm, haptic, space, Txt, useColors } from "@/ui";

import { PIN_LENGTH, isWeakPin } from "./pinVault";
import { finishPinRequest, type PinRequest, usePinRequest } from "./pinRequest";
import { eraseEverything, vault } from "./webVault";

const KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "",
  "0",
  "borrar",
] as const;

/**
 * Pantalla del PIN (versión web). Tapa todo mientras haya una petición:
 * crear el PIN, abrir los datos o confirmar que eres tú.
 */
export function PinPrompt() {
  const request = usePinRequest();
  if (!request) return null;
  return <PinPad key={request.id} request={request} />;
}

function PinPad({ request }: { request: PinRequest }) {
  const colors = useColors();
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(() => vault.waitLeft());
  const busyRef = useRef(false);

  const creating = request.kind === "crear";
  const title =
    request.title ??
    (creating
      ? first
        ? "Repite tu PIN"
        : "Crea tu PIN"
      : request.kind === "abrir"
        ? "Escribe tu PIN"
        : "Confirma que eres tú");
  const shownTitle =
    creating && first && request.title
      ? `Repite el ${request.title.toLowerCase()}`
      : title;

  // Cuenta regresiva si hubo demasiados intentos fallidos.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setInterval(() => setWait(vault.waitLeft()), 500);
    return () => clearInterval(timer);
  }, [wait]);

  const submit = async (value: string) => {
    if (creating) {
      if (!first) {
        if (isWeakPin(value)) {
          setError("Ese PIN es muy fácil de adivinar. Usa otro.");
          setPin("");
          haptic.warning();
          return;
        }
        setFirst(value);
        setPin("");
        setError(null);
        return;
      }
      if (value !== first) {
        setError("No coinciden. Empieza otra vez.");
        setFirst(null);
        setPin("");
        haptic.warning();
        return;
      }
      haptic.success();
      finishPinRequest(value);
      return;
    }
    if (!request.check) {
      finishPinRequest(value);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const ok = await request.check(value).catch(() => false);
    busyRef.current = false;
    setBusy(false);
    if (ok) {
      haptic.success();
      finishPinRequest(value);
      return;
    }
    haptic.warning();
    setPin("");
    const left = vault.waitLeft();
    setWait(left);
    setError(left > 0 ? "Demasiados intentos." : "PIN incorrecto.");
  };

  const press = (key: string) => {
    if (busyRef.current || wait > 0) return;
    if (key === "borrar") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key)) return;
    setError(null);
    setPin((p) => {
      if (p.length >= PIN_LENGTH) return p;
      const next = p + key;
      if (next.length === PIN_LENGTH) setTimeout(() => void submit(next), 120);
      return next;
    });
  };
  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });

  // Teclado físico (computadora).
  useEffect(() => {
    const doc = globalThis.document;
    if (!doc) return;
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) pressRef.current(event.key);
      else if (event.key === "Backspace") pressRef.current("borrar");
    };
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
  }, []);

  const forgot = () =>
    confirm({
      title: "¿Olvidaste tu PIN?",
      message:
        "Tus datos están cifrados con ese PIN y no hay forma de recuperarlos sin él. Puedes borrar todo y empezar de nuevo (y luego restaurar un respaldo si tienes uno).",
      confirmLabel: "Borrar todo",
      destructive: true,
      onConfirm: eraseEverything,
    });

  const reason =
    request.reason ??
    (creating
      ? first
        ? "Escríbelo otra vez para confirmar."
        : `Elige ${PIN_LENGTH} números. Con este PIN se cifran tus datos en este teléfono. Si lo olvidas no se pueden recuperar.`
      : request.kind === "abrir"
        ? "Tus datos están cifrados en este teléfono."
        : undefined);

  return (
    <View
      style={[styles.cover, { backgroundColor: colors.bg }]}
      accessibilityViewIsModal
    >
      <View style={styles.inner}>
        <View style={[styles.logo, { backgroundColor: colors.primary }]}>
          <Ionicons
            name={creating ? "key" : "lock-closed"}
            size={30}
            color={colors.onPrimary}
          />
        </View>
        <Txt variant="title" center>
          {shownTitle}
        </Txt>
        {reason ? (
          <Txt muted center>
            {reason}
          </Txt>
        ) : null}

        <View
          style={styles.dots}
          accessibilityLabel={`${pin.length} de ${PIN_LENGTH} números`}
        >
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  borderColor: error ? colors.negative : colors.primary,
                  backgroundColor:
                    i < pin.length
                      ? error
                        ? colors.negative
                        : colors.primary
                      : "transparent",
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.status}>
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : wait > 0 ? (
            <Txt variant="small" color={colors.negative} center>
              Demasiados intentos. Espera {Math.ceil(wait / 1000)} s.
            </Txt>
          ) : error ? (
            <Txt variant="small" color={colors.negative} center>
              {error}
            </Txt>
          ) : null}
        </View>

        <View style={styles.pad}>
          {KEYS.map((key, i) =>
            key === "" ? (
              <View key={i} style={styles.key} />
            ) : (
              <Pressable
                key={i}
                onPress={() => press(key)}
                accessibilityRole="button"
                accessibilityLabel={key === "borrar" ? "Borrar" : key}
                style={({ pressed }) => [
                  styles.key,
                  key !== "borrar" && {
                    backgroundColor: pressed ? colors.primarySoft : colors.card,
                    borderColor: colors.border,
                    borderWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                {key === "borrar" ? (
                  <Ionicons
                    name="backspace-outline"
                    size={26}
                    color={colors.text}
                  />
                ) : (
                  <Txt variant="title" center>
                    {key}
                  </Txt>
                )}
              </Pressable>
            ),
          )}
        </View>

        {request.cancellable ? (
          <Button
            variant="ghost"
            label="Cancelar"
            onPress={() => finishPinRequest(null)}
          />
        ) : request.kind === "abrir" ? (
          <Button variant="ghost" label="Olvidé mi PIN" onPress={forgot} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2000,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  inner: { width: "100%", maxWidth: 360, alignItems: "center", gap: space.md },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  dots: { flexDirection: "row", gap: space.lg, marginTop: space.md },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  status: { minHeight: 24, justifyContent: "center" },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 288,
    justifyContent: "space-between",
    rowGap: space.md,
  },
  key: {
    width: 84,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
