import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_OPTIONS } from '@/core/layout';
import { useStore } from '@/data/store';
import { haptic, iconName, MAX_WIDTH, PressableScale, Txt, useColors } from '@/ui';

/** Barra de pestañas flotante: muestra las pestañas que eligió el usuario y el botón "+" al centro. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const chosen = useStore((s) => s.settings.tabs);
  const current = state.routes[state.index]?.name;
  const tabs = chosen.flatMap((key) => {
    const option = TAB_OPTIONS.find((t) => t.key === key);
    const route = state.routes.find((r) => r.name === key);
    return option && route ? [{ option, route }] : [];
  });
  // El "+" va en medio: con 5 pestañas queda entre la 2.ª y la 3.ª.
  const addAfter = Math.floor(tabs.length / 2) - 1;

  const add = (
    <View style={styles.tab}>
      <PressableScale
        accessibilityLabel="Agregar movimiento"
        onPress={() => {
          haptic.press();
          router.push('/movimiento');
        }}
        style={[styles.add, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
        <Ionicons name="add" size={30} color={colors.onPrimary} />
      </PressableScale>
    </View>
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: '#000' }]}>
        {tabs.map(({ option, route }, index) => {
          const focused = current === option.key;
          return (
            <Fragment key={option.key}>
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: focused }}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    haptic.tap();
                    navigation.navigate(route.name, route.params);
                  }
                }}
                style={styles.tab}>
                <Ionicons name={iconName(option.icons[focused ? 1 : 0])} size={22} color={focused ? colors.primary : colors.faint} />
                <Txt variant="small" color={focused ? colors.primary : colors.faint} style={styles.label} numberOfLines={1}>
                  {option.label}
                </Txt>
              </Pressable>
              {index === addAfter ? add : null}
            </Fragment>
          );
        })}
        {addAfter < 0 ? add : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: MAX_WIDTH - 24,
    height: 66,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: '100%' },
  label: { fontSize: 10.5, fontWeight: '600' },
  add: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
