import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatShort } from '@/core/dates';
import { PALETTE } from '@/core/defaults';
import { newId, timestamp } from '@/core/id';
import { formatMoney, parseAmount } from '@/core/money';
import { payFrequency, payPeriod, type PaySchedule, previousPayday, QUINCENAL } from '@/core/payCycle';
import { useDb, useToday } from '@/data/hooks';
import { PAY_AMOUNT_LABEL, PaySchedulePicker } from '@/features/shared/PaySchedulePicker';
import { AmountField, Button, Card, Field, Group, haptic, IconBadge, type IconName, MAX_WIDTH, Row, Segmented, space, Txt, useColors } from '@/ui';

const FEATURES: { icon: IconName; color: string; title: string; text: string }[] = [
  { icon: 'cash', color: '#22C55E', title: 'Sabe cuánto puedes gastar', text: 'Resta tus apartados y lo que vence antes de tu próximo pago.' },
  { icon: 'card', color: '#6366F1', title: 'Entiende tus tarjetas', text: 'Cada una con su corte y su fecha de pago, sin confundirte.' },
  { icon: 'lock-closed', color: '#0EA5E9', title: 'Privada y sin internet', text: 'Tus datos se guardan cifrados, solo en tu teléfono.' },
];

const STEPS = 5;

/** Primera vez: cuánto tienes, cuánto ganas y si ya te pagaron; con eso la app sabe cuánto puedes gastar. */
export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const db = useDb();
  const today = useToday();

  const [step, setStep] = useState(0);
  const [accountName, setAccountName] = useState('Cuenta principal');
  const [balance, setBalance] = useState('');
  const [pay, setPay] = useState('');
  const [schedule, setSchedule] = useState<PaySchedule>({ payDays: QUINCENAL });
  const [paid, setPaid] = useState<'si' | 'no'>('si');

  const frequency = payFrequency(schedule);
  const variable = frequency === 'variable';
  const balanceCents = parseAmount(balance) ?? 0;
  // Con ingreso variable lo escrito es lo que se calcula ganar al mes, no un pago fijo.
  const payCents = variable ? 0 : (parseAmount(pay) ?? 0);
  // El pago más reciente según esos días (puede ser hoy) y lo que falta para el siguiente.
  const lastPayday = previousPayday(today, schedule);
  const period = payPeriod(today, schedule);
  const money = (cents: number) => formatMoney(cents, { symbol: db.settings.currency });

  const finish = () => {
    const accountId = db.accounts[0]?.id ?? newId();
    if (db.accounts.length === 0) {
      db.save('accounts', {
        id: accountId,
        name: accountName.trim() || 'Cuenta principal',
        kind: 'banco',
        initialBalance: parseAmount(balance) ?? 0,
        color: PALETTE[1],
        createdAt: timestamp(),
      });
    }
    db.setSettings({
      payAmount: payCents,
      payDays: schedule.payDays,
      payWeekly: schedule.payWeekly,
      incomeEstimate: variable ? (parseAmount(pay) ?? 0) : undefined,
      payAccountId: accountId,
      startedOn: today,
      onboarded: true,
      // "Ya me pagaron": el saldo escrito ya lo incluye, así que Inicio no vuelve a preguntar por ese pago.
      skippedPaydays: payCents > 0 && paid === 'si' && lastPayday === today ? [today] : [],
      // "Todavía no": Inicio lo pregunta hasta que llegue, y se suma con un toque.
      pendingFirstPay: payCents > 0 && paid === 'no' && lastPayday < today ? lastPayday : undefined,
    });
    haptic.success();
    router.replace('/');
  };

  const next = () => {
    haptic.press();
    if (step < STEPS - 1) setStep(step + 1);
    else finish();
  };

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl }]}>
        <View style={styles.dots}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i <= step ? colors.primary : colors.border, flex: i === step ? 2 : 1 }]} />
          ))}
        </View>

        <Animated.View key={step} entering={FadeInRight.duration(280)} style={styles.step}>
          {step === 0 ? (
            <>
              <View style={[styles.logo, { backgroundColor: colors.primary }]}>
                <Ionicons name="wallet" size={40} color={colors.onPrimary} />
              </View>
              <Txt variant="title">Tu dinero, claro y en orden</Txt>
              <Txt muted>Configúrala en un minuto. Todo se guarda solo en tu teléfono.</Txt>
              <Card style={{ paddingVertical: space.xs }}>
                {FEATURES.map((f, i) => (
                  <Row key={f.title} icon={f.icon} color={f.color} title={f.title} subtitle={f.text} subtitleLines={2} last={i === FEATURES.length - 1} />
                ))}
              </Card>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Txt variant="title">¿Cuánto dinero tienes hoy?</Txt>
              <Txt muted>El saldo de la cuenta donde te depositan. Desde aquí la app lleva la cuenta por ti.</Txt>
              <AmountField value={balance} onChangeText={setBalance} autoFocus />
              <Group label="Nombre de la cuenta">
                <Field value={accountName} onChangeText={setAccountName} maxLength={30} placeholder="Ej. Monetaria Banrural" />
              </Group>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Txt variant="title">¿Cuánto ganas y cada cuánto?</Txt>
              <Txt muted>Con esto se calcula cuánto puedes gastar hasta tu próximo pago.</Txt>
              <Group label="¿Cada cuánto te pagan?">
                <PaySchedulePicker value={schedule} onChange={setSchedule} today={today} />
              </Group>
              <Group label={PAY_AMOUNT_LABEL[frequency]}>
                <AmountField value={pay} onChangeText={setPay} color={colors.positive} />
              </Group>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Txt variant="title">{payCents > 0 ? (lastPayday === today ? '¿Ya te pagaron hoy?' : `¿Ya recibiste tu pago del ${formatShort(lastPayday)}?`) : 'Lo que puedes gastar'}</Txt>
              {payCents > 0 ? (
                <>
                  <Txt muted>
                    {lastPayday === today ? 'Hoy es día de pago.' : 'Es tu pago más reciente.'} Dime si esos {money(payCents)} ya están dentro de los {money(balanceCents)} que escribiste.
                  </Txt>
                  <Segmented
                    value={paid}
                    onChange={setPaid}
                    options={[
                      { value: 'si', label: 'Sí, ya está en mi saldo' },
                      { value: 'no', label: 'Todavía no' },
                    ]}
                  />
                </>
              ) : (
                <Txt muted>{variable ? 'Como tu ingreso es variable, cada vez que te entre dinero lo anotas con el botón +, tipo Ingreso.' : 'No escribiste cuánto ganas; puedes ponerlo después en Ajustes.'}</Txt>
              )}
              <Card style={{ gap: space.sm, backgroundColor: colors.positiveSoft, borderColor: colors.positive }}>
                <Txt variant="caption" muted>
                  Disponible para gastar hoy
                </Txt>
                <Txt variant="title" color={balanceCents >= 0 ? colors.positive : colors.negative}>
                  {money(balanceCents)}
                </Txt>
                <Txt>
                  {payCents > 0 && paid === 'no'
                    ? `Cuando te caiga el pago, Inicio te lo pregunta y con un toque sube a ${money(balanceCents + payCents)}.`
                    : frequency === 'diario'
                      ? 'Es lo que tienes hasta tu pago de mañana.'
                      : variable
                        ? `Te tiene que alcanzar hasta que termine el mes: ${money(balanceCents > 0 ? Math.floor(balanceCents / period.daysLeft) : 0)} por día durante ${period.daysLeft} ${period.daysLeft === 1 ? 'día' : 'días'}.`
                        : `Te tiene que alcanzar hasta el ${formatShort(period.end)}: ${money(balanceCents > 0 ? Math.floor(balanceCents / period.daysLeft) : 0)} por día durante ${period.daysLeft} ${period.daysLeft === 1 ? 'día' : 'días'}.`}
                </Txt>
                <Txt variant="small" muted>
                  Después la app le resta solo lo que apartes y lo que venza antes de tu próximo pago (tarjetas, gastos fijos, deudas).
                </Txt>
              </Card>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Txt variant="title">Tus tarjetas de crédito</Txt>
              <Txt muted>Agrega cada tarjeta con su día de corte y de pago. Puedes hacerlo después si prefieres.</Txt>
              {db.cards.length > 0 ? (
                <Card style={{ paddingVertical: space.xs }}>
                  {db.cards.map((card, i) => (
                    <Row
                      key={card.id}
                      icon="card"
                      color={card.color}
                      title={card.name}
                      subtitle={`Corte día ${card.cutoffDay} · pago día ${card.paymentDay}`}
                      chevron
                      last={i === db.cards.length - 1}
                      onPress={() => router.push({ pathname: '/tarjeta', params: { id: card.id } })}
                    />
                  ))}
                </Card>
              ) : (
                <View style={styles.emptyCards}>
                  <IconBadge icon="card" color={colors.primary} size={64} />
                </View>
              )}
              <Button variant="soft" icon="add" label={db.cards.length ? 'Agregar otra tarjeta' : 'Agregar tarjeta'} onPress={() => router.push('/tarjeta')} />
            </>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md, borderTopColor: colors.border }]}>
        <View style={styles.footerInner}>
          {step > 0 ? <Button variant="ghost" label="Atrás" onPress={() => setStep(step - 1)} /> : null}
          <Button
            label={step === 0 ? 'Empezar' : step === STEPS - 1 ? (db.cards.length ? 'Terminar' : 'Terminar sin tarjetas') : 'Continuar'}
            onPress={next}
            style={styles.flex}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  dots: { flexDirection: 'row', gap: 6, marginBottom: space.xxl },
  dot: { height: 5, borderRadius: 3 },
  step: { gap: space.lg },
  logo: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  emptyCards: { alignItems: 'center', paddingVertical: space.xl },
  footer: { paddingTop: space.md, paddingHorizontal: space.xl, borderTopWidth: StyleSheet.hairlineWidth },
  footerInner: { flexDirection: 'row', gap: space.md, width: '100%', maxWidth: MAX_WIDTH - space.xl * 2, alignSelf: 'center' },
});
