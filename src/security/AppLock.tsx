import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { flushStorage } from '@/data/storage';
import { useStore } from '@/data/store';
import { Button, space, Txt, useColors } from '@/ui';

import { authenticate } from './lock';
import { setScreenShield } from './screenShield';

/** Tiempo fuera de la app después del cual se vuelve a pedir Face ID / código. */
export const RELOCK_AFTER_MS = 60_000;

/**
 * En la versión web el PIN ya se pidió para abrir los datos, así que no se pide
 * otra vez al arrancar; sí al volver después de un rato fuera (siempre, no es opcional).
 */
const WEB = Platform.OS === 'web';

/**
 * Envuelve toda la app:
 *  - si el bloqueo está activo, tapa el contenido hasta que el dueño del teléfono se identifique;
 *  - al salir de la app guarda lo pendiente;
 *  - aplica el escudo de pantalla según el ajuste.
 * El contenido sigue montado debajo (así no se pierde lo que estabas escribiendo),
 * pero no se ve ni se puede tocar.
 */
export function AppLock({ children }: { children: ReactNode }) {
  const colors = useColors();
  const enabled = useStore((s) => s.settings.lockEnabled) || WEB;
  const shield = useStore((s) => s.settings.shieldScreen);
  const [locked, setLocked] = useState(enabled && !WEB);
  const leftAt = useRef<number | null>(null);
  const asking = useRef(false);

  /** true mientras falte mostrar por primera vez el aviso de Face ID de este bloqueo. */
  const promptPending = useRef(enabled && !WEB);

  const unlock = () => {
    if (asking.current) return;
    asking.current = true;
    promptPending.current = false;
    authenticate('Desbloquear Mis Finanzas').then((ok) => {
      asking.current = false;
      if (ok) setLocked(false);
    });
  };
  const unlockRef = useRef(unlock);
  useEffect(() => {
    unlockRef.current = unlock;
  });

  useEffect(() => {
    void setScreenShield(shield);
  }, [shield]);

  useEffect(() => {
    // Al abrir: si ya está en primer plano, pide identificación de una vez.
    if (promptPending.current && AppState.currentState === 'active') unlockRef.current();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (leftAt.current === null) leftAt.current = Date.now();
        void flushStorage();
      } else if (state === 'inactive') {
        void flushStorage();
      } else if (state === 'active') {
        const away = leftAt.current === null ? 0 : Date.now() - leftAt.current;
        leftAt.current = null;
        if ((WEB || useStore.getState().settings.lockEnabled) && away >= RELOCK_AFTER_MS) {
          setLocked(true);
          promptPending.current = true;
        }
        // Se pide sola una vez por bloqueo; si el usuario cancela, queda el botón (sin insistir en bucle).
        if (promptPending.current) unlockRef.current();
      }
    });
    return () => subscription.remove();
  }, []);

  const showLock = locked && enabled;

  return (
    <View style={styles.flex}>
      <View
        style={styles.flex}
        pointerEvents={showLock ? 'none' : 'auto'}
        accessibilityElementsHidden={showLock}
        importantForAccessibility={showLock ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {showLock ? (
        <View style={[styles.cover, { backgroundColor: colors.bg }]} accessibilityViewIsModal>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Ionicons name="lock-closed" size={36} color={colors.onPrimary} />
          </View>
          <Txt variant="title" center>
            Mis Finanzas
          </Txt>
          <Txt muted center>
            Bloqueada para proteger tu información.
          </Txt>
          <Button label="Desbloquear" icon="lock-open-outline" onPress={unlock} style={styles.button} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xxl,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  button: { marginTop: space.lg, alignSelf: 'stretch' },
});
