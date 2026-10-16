import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/data/store';
import { UNDO_MS, useUndo } from '@/data/undo';
import { haptic, MAX_WIDTH, radius, space, Txt, useColors } from '@/ui';

/** Aviso que aparece unos segundos después de borrar algo, con el botón Deshacer. */
export function UndoBar() {
  const entry = useUndo((s) => s.entry);
  const clear = useUndo((s) => s.clear);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const at = entry?.at;

  useEffect(() => {
    if (at === undefined) return;
    const timer = setTimeout(clear, UNDO_MS);
    return () => clearTimeout(timer);
  }, [at, clear]);

  if (!entry) return null;

  const undo = () => {
    haptic.success();
    useStore.getState().replaceAll(entry.snapshot);
    clear();
  };

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 96 }]}>
      <Animated.View key={entry.at} entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(180)} style={[styles.bar, { backgroundColor: colors.text }]}>
        <Ionicons name="trash-outline" size={18} color={colors.bg} />
        <Txt style={styles.flex} color={colors.bg} numberOfLines={1}>
          {entry.label}
        </Txt>
        <Pressable accessibilityRole="button" accessibilityLabel="Deshacer" hitSlop={12} onPress={undo}>
          <Txt variant="bodyStrong" color={colors.bg} style={styles.action}>
            Deshacer
          </Txt>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.md, width: '100%', maxWidth: MAX_WIDTH - space.lg * 2, paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: radius.md },
  action: { textDecorationLine: 'underline' },
});
