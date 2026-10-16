import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Txt } from './primitives';
import { MAX_WIDTH, space, TAB_BAR_SPACE, useColors } from './theme';

/** Regresa a la pantalla anterior, o al inicio si se entró directo (p. ej. desde un enlace). */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

interface ScreenProps {
  title: string;
  subtitle?: string;
  /** Muestra la flecha para regresar (pantallas que no son pestañas). */
  back?: boolean;
  /** Botón a la derecha del título. */
  right?: ReactNode;
  /** Deja espacio abajo para la barra de pestañas. */
  tabs?: boolean;
  /** Se dibuja dentro de otra pantalla (sin título ni desplazamiento propios): solo el subtítulo y el botón. */
  embedded?: boolean;
  children: ReactNode;
}

/** Pantalla normal con título grande y contenido desplazable. */
export function Screen({ title, subtitle, back, right, tabs, embedded, children }: ScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  if (embedded) {
    return (
      <View>
        {subtitle || right ? (
          <View style={styles.embeddedHeader}>
            <Txt muted style={styles.flex}>
              {subtitle}
            </Txt>
            {right}
          </View>
        ) : null}
        {children}
      </View>
    );
  }
  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: (tabs ? TAB_BAR_SPACE : space.xxl) + insets.bottom },
        ]}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Regresar" hitSlop={12} onPress={goBack} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
            <Txt variant="bodyStrong" color={colors.primary}>
              Atrás
            </Txt>
          </Pressable>
        ) : null}
        <View style={styles.header}>
          <View style={styles.flex}>
            <Txt variant="title">{title}</Txt>
            {subtitle ? <Txt muted>{subtitle}</Txt> : null}
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

interface FormScreenProps {
  title: string;
  saveLabel?: string;
  onSave: () => void;
  canSave?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
  children: ReactNode;
}

/** Pantalla de formulario (sube desde abajo): Cancelar arriba, Guardar fijo abajo. */
export function FormScreen({ title, saveLabel = 'Guardar', onSave, canSave = true, onDelete, deleteLabel = 'Eliminar', children }: FormScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const top = insets.top + space.md;
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.formHeader, { paddingTop: top, borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={goBack} style={styles.formSide}>
          <Txt color={colors.primary}>Cancelar</Txt>
        </Pressable>
        <Txt variant="bodyStrong" numberOfLines={1} style={styles.formTitle}>
          {title}
        </Txt>
        <View style={styles.formSide} />
      </View>
      <ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, styles.formContent]}>
        {children}
        {onDelete ? <Button label={deleteLabel} variant="danger" icon="trash-outline" onPress={onDelete} style={{ marginTop: space.lg }} /> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md, backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <View style={styles.footerInner}>
          <Button label={saveLabel} onPress={onSave} disabled={!canSave} icon="checkmark" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  embeddedHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.lg, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -6, marginBottom: space.sm, alignSelf: 'flex-start' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  formSide: { width: 84 },
  formTitle: { flex: 1, textAlign: 'center' },
  formContent: { paddingTop: space.lg, paddingBottom: space.xxl, gap: space.lg },
  footer: { paddingTop: space.md, paddingHorizontal: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
  footerInner: { width: '100%', maxWidth: MAX_WIDTH - space.lg * 2, alignSelf: 'center' },
});
