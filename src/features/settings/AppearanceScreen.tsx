import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { DEFAULT_ACCENT, PALETTE } from '@/core/defaults';
import {
  DEFAULT_HOME_SECTIONS,
  DEFAULT_TABS,
  HOME_SECTIONS,
  MAX_TABS,
  move,
  TAB_OPTIONS,
  toggleTab,
} from '@/core/layout';
import type { Settings } from '@/core/types';
import { useDb } from '@/data/hooks';
import { Button, Card, FadeIn, haptic, IconBadge, iconName, notify, Screen, SectionTitle, Segmented, space, Txt, useColors } from '@/ui';

const ACCENTS = [DEFAULT_ACCENT, ...PALETTE.filter((color) => color !== DEFAULT_ACCENT)];

/** Apariencia: tema, color, pestañas de la barra y secciones de Inicio. */
export default function AppearanceScreen() {
  const colors = useColors();
  const db = useDb();
  const { settings } = db;

  const setTabs = (tabs: string[] | null) => {
    if (!tabs) return;
    haptic.tap();
    db.setSettings({ tabs });
  };

  const onToggleTab = (key: string) => {
    const next = toggleTab(settings.tabs, key);
    if (!next) {
      notify('Máximo de pestañas', `La barra admite hasta ${MAX_TABS}. Quita una para agregar otra.`);
      return;
    }
    setTabs(next);
  };

  const toggleSection = (key: string) => {
    haptic.tap();
    const on = settings.homeSections.includes(key);
    db.setSettings({ homeSections: on ? settings.homeSections.filter((s) => s !== key) : [...settings.homeSections, key] });
  };

  // Primero las activas en su orden; después las apagadas.
  const tabRows = [
    ...settings.tabs.flatMap((key) => TAB_OPTIONS.filter((t) => t.key === key)),
    ...TAB_OPTIONS.filter((t) => !settings.tabs.includes(t.key)),
  ];
  const sectionRows = [
    ...settings.homeSections.flatMap((key) => HOME_SECTIONS.filter((s) => s.key === key)),
    ...HOME_SECTIONS.filter((s) => !settings.homeSections.includes(s.key)),
  ];

  return (
    <Screen title="Apariencia" subtitle="Hazla a tu gusto" back>
      <FadeIn>
        <SectionTitle title="Tema" />
        <Card style={{ gap: space.md }}>
          <Segmented<Settings['theme']>
            value={settings.theme}
            onChange={(theme) => db.setSettings({ theme })}
            options={[
              { value: 'sistema', label: 'Automático' },
              { value: 'claro', label: 'Claro' },
              { value: 'oscuro', label: 'Oscuro' },
            ]}
          />
          <Txt variant="small" muted>
            Automático sigue el modo claro u oscuro de tu teléfono.
          </Txt>
        </Card>
      </FadeIn>

      <FadeIn index={1}>
        <SectionTitle title="Color principal" />
        <Card style={{ gap: space.md }}>
          <View style={styles.swatches}>
            {ACCENTS.map((color) => {
              const selected = settings.accent.toUpperCase() === color.toUpperCase();
              return (
                <Pressable
                  key={color}
                  accessibilityRole="button"
                  accessibilityLabel={`Color ${color}`}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    haptic.tap();
                    db.setSettings({ accent: color });
                  }}
                  style={[styles.swatch, { backgroundColor: color, borderColor: selected ? colors.text : 'transparent' }]}>
                  {selected ? <Ionicons name="checkmark" size={20} color="#FFFFFF" /> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.preview}>
            <Button small label="Botón" onPress={() => {}} />
            <Button small variant="soft" label="Secundario" onPress={() => {}} />
            <Txt variant="label" color={colors.primary}>
              Enlace
            </Txt>
          </View>
          <Txt variant="small" muted>
            El verde y el rojo de los montos no cambian: siempre significan a favor y en contra.
          </Txt>
        </Card>
      </FadeIn>

      <FadeIn index={2}>
        <SectionTitle title="Pestañas" />
        <Card style={{ paddingVertical: space.xs }}>
          {tabRows.map((tab, row) => {
            const index = settings.tabs.indexOf(tab.key);
            const on = index >= 0;
            return (
              <OrderRow
                key={tab.key}
                icon={tab.icons[1]}
                title={tab.label}
                subtitle={tab.required ? 'Siempre visible' : on ? 'En la barra' : 'Se abre desde Más'}
                on={on}
                locked={tab.required}
                last={row === tabRows.length - 1}
                onToggle={() => onToggleTab(tab.key)}
                onUp={on && index > 0 ? () => setTabs(move(settings.tabs, index, -1)) : undefined}
                onDown={on && index < settings.tabs.length - 1 ? () => setTabs(move(settings.tabs, index, 1)) : undefined}
              />
            );
          })}
        </Card>
        <Txt variant="small" muted style={styles.note}>
          Elige hasta {MAX_TABS} y ordénalas con las flechas. Las que apagues siguen disponibles en Más.
        </Txt>
      </FadeIn>

      <FadeIn index={3}>
        <SectionTitle title="Pantalla de inicio" />
        <Card style={{ paddingVertical: space.xs }}>
          {sectionRows.map((section, row) => {
            const index = settings.homeSections.indexOf(section.key);
            const on = index >= 0;
            return (
              <OrderRow
                key={section.key}
                title={section.label}
                subtitle={section.description}
                on={on}
                last={row === sectionRows.length - 1}
                onToggle={() => toggleSection(section.key)}
                onUp={on && index > 0 ? () => db.setSettings({ homeSections: move(settings.homeSections, index, -1) }) : undefined}
                onDown={
                  on && index < settings.homeSections.length - 1
                    ? () => db.setSettings({ homeSections: move(settings.homeSections, index, 1) })
                    : undefined
                }
              />
            );
          })}
        </Card>
        <Txt variant="small" muted style={styles.note}>
          El total “Libre para gastar” siempre va arriba.
        </Txt>
      </FadeIn>

      <Button
        variant="ghost"
        icon="refresh"
        label="Volver al diseño original"
        style={{ marginTop: space.xl }}
        onPress={() => {
          haptic.success();
          db.setSettings({ theme: 'sistema', accent: DEFAULT_ACCENT, tabs: [...DEFAULT_TABS], homeSections: [...DEFAULT_HOME_SECTIONS] });
        }}
      />
    </Screen>
  );
}

interface OrderRowProps {
  icon?: string;
  title: string;
  subtitle: string;
  on: boolean;
  locked?: boolean;
  last: boolean;
  onToggle: () => void;
  onUp?: () => void;
  onDown?: () => void;
}

/** Fila con interruptor (mostrar / ocultar) y flechas para subir o bajar. */
function OrderRow({ icon, title, subtitle, on, locked, last, onToggle, onUp, onDown }: OrderRowProps) {
  const colors = useColors();
  const arrow = (name: 'chevron-up' | 'chevron-down', action: (() => void) | undefined, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${title}`}
      accessibilityState={{ disabled: !action }}
      disabled={!action}
      hitSlop={6}
      onPress={action}
      style={[styles.arrow, { backgroundColor: colors.cardAlt, opacity: action ? 1 : 0.3 }]}>
      <Ionicons name={name} size={18} color={colors.text} />
    </Pressable>
  );
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={title}
        accessibilityState={{ checked: on, disabled: !!locked }}
        disabled={locked}
        hitSlop={8}
        onPress={onToggle}>
        <Ionicons
          name={locked ? 'lock-closed' : on ? 'checkmark-circle' : 'ellipse-outline'}
          size={26}
          color={locked ? colors.faint : on ? colors.primary : colors.faint}
        />
      </Pressable>
      {icon ? <IconBadge icon={iconName(icon)} color={on ? colors.primary : colors.faint} size={34} /> : null}
      <View style={styles.text}>
        <Txt variant="bodyStrong" color={on ? colors.text : colors.muted} numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="small" muted numberOfLines={1}>
          {subtitle}
        </Txt>
      </View>
      {arrow('chevron-up', onUp, 'Subir')}
      {arrow('chevron-down', onDown, 'Bajar')}
    </View>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  note: { marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  text: { flex: 1, gap: 2 },
  arrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
