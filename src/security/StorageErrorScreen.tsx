import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Button, space, Txt, useColors } from '@/ui';

/**
 * Se muestra si los datos guardados no se pudieron abrir (por ejemplo, el
 * llavero no respondió). No se escribe nada mientras tanto: los datos quedan
 * intactos y se puede reintentar.
 */
export function StorageErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.icon, { backgroundColor: colors.warningSoft }]}>
        <Ionicons name="lock-closed" size={36} color={colors.warning} />
      </View>
      <Txt variant="title" center>
        No se pudieron abrir tus datos
      </Txt>
      <Txt muted center>
        Tus datos siguen guardados y no se modificó nada. Desbloquea el teléfono y vuelve a intentar.
      </Txt>
      <Txt variant="small" muted center>
        {message}
      </Txt>
      <Button label="Reintentar" icon="refresh" onPress={onRetry} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xxl,
  },
  icon: {
    width: 84,
    height: 84,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  button: { marginTop: space.lg, alignSelf: 'stretch' },
});
