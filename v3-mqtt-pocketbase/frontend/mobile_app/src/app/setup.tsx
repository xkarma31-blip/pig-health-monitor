/**
 * 🧑‍🌾 Setup wizard — the ONLY screen a farmer needs on day one.
 *
 * 3 steps, big text, big buttons, plain language (EN/Filipino):
 *   1. Find your box (scan well-known addresses or type it, then Test)
 *   2. Name your farm/pen (labels only, stored on this phone)
 *   3. Done — then opens the dashboard
 *
 * Canon-flavored: "the box" is PocketBase (`/api/health`), not a
 * compute-node gateway — data flows ESP32 → MQTT → Bridge → PocketBase → app.
 * No account, no env vars, no jargon. Reachable from Home DEMO banner
 * and Settings → "Set up a device".
 */
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { ActionButton, SegmentedControl } from '../components/primitives';
import { getFarmerText, FARMER_LANGS, type FarmerLang } from '../utils/farmerText';
import { PB_SCAN_CANDIDATES, probePocketBase, saveFarmerSetup } from '../utils/setupStore';
import { pbList } from '../utils/pocketbase';
import { playSound } from '../utils/sounds';
import { haptic } from '../utils/haptics';

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export default function SetupScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const [lang, setLang] = useState<FarmerLang>('en');
  const t = getFarmerText(lang);
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState('');
  const [farmName, setFarmName] = useState('');
  const [penName, setPenName] = useState('');
  const [test, setTest] = useState<TestState>('idle');
  const [scanning, setScanning] = useState(false);
  const [liveNote, setLiveNote] = useState('');

  const press = () => {
    playSound('tap');
    haptic('light');
  };

  const normalize = (raw: string): string => {
    let u = raw.trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
    return u.replace(/\/+$/, '');
  };

  const runTest = async (url: string): Promise<boolean> => {
    setTest('testing');
    const ok = await probePocketBase(url);
    if (ok) {
      try {
        const { items } = await pbList('telemetry', { sort: '-created', perPage: 1 });
        const first = items[0] as Record<string, unknown> | undefined;
        setLiveNote(first ? `${String(first.pigId || first.deviceId || 'box')} · ${String(first.temperature ?? '?')}°C` : '');
      } catch {
        setLiveNote('');
      }
    }
    setTest(ok ? 'ok' : 'fail');
    playSound(ok ? 'success' : 'alert');
    haptic(ok ? 'success' : 'error');
    return ok;
  };

  const onScan = async () => {
    press();
    setScanning(true);
    try {
      for (const candidate of PB_SCAN_CANDIDATES) {
        if (await probePocketBase(candidate, 1500)) {
          setAddress(candidate);
          await runTest(candidate);
          return;
        }
      }
      setTest('fail');
    } finally {
      setScanning(false);
    }
  };

  const onNextFromStep1 = async () => {
    press();
    const url = normalize(address);
    if (!url) {
      setTest('fail');
      return;
    }
    setAddress(url);
    if (await runTest(url)) setStep(2);
  };

  const onFinish = async (skipped: boolean) => {
    press();
    await saveFarmerSetup({
      pbUrl: skipped ? '' : normalize(address),
      farmName: farmName.trim(),
      penName: penName.trim(),
      lang,
      setupDone: !skipped,
    });
    router.replace('/tabs');
  };

  const inputStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 17,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg, flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[typography.h1, { color: colors.textPrimary }]}>{t.setupTitle}</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginTop: 4 }]}>{t.setupSubtitle}</Text>

      <View style={{ marginTop: spacing.md }}>
        <SegmentedControl
          options={FARMER_LANGS.map((l) => ({ key: l.code, label: l.label }))}
          value={lang}
          onChange={(v) => setLang(v as FarmerLang)}
        />
      </View>

      {step === 1 && (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[typography.h2, { color: colors.textPrimary }]}>{t.step1Title}</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 24 }]}>
            {t.step1Body}
          </Text>
          <Text style={[typography.body, { fontWeight: '700', marginTop: spacing.lg }]}>{t.gatewayLabel}</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder={t.gatewayPlaceholder}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
            accessibilityLabel={t.gatewayLabel}
          />
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <ActionButton onPress={onScan} variant="secondary" accessibilityLabel={t.scanButton} disabled={scanning}>
              {scanning ? t.testing : t.scanButton}
            </ActionButton>
            <ActionButton
              onPress={() => runTest(normalize(address))}
              variant="secondary"
              accessibilityLabel={t.testButton}
              disabled={!address.trim() || test === 'testing'}
            >
              {t.testButton}
            </ActionButton>
          </View>
          {test === 'testing' && (
            <Text style={[typography.body, { marginTop: spacing.md }]}>{t.testing}</Text>
          )}
          {test === 'ok' && (
            <View style={{ marginTop: spacing.md, backgroundColor: colors.healthySoft, borderRadius: radius.md, padding: spacing.md }}>
              <Text style={[typography.body, { fontWeight: '700' }]}>{t.testOk}</Text>
              {!!liveNote && (
                <Text style={[typography.body, { marginTop: 4 }]}>{liveNote}</Text>
              )}
            </View>
          )}
          {test === 'fail' && (
            <View style={{ marginTop: spacing.md, backgroundColor: colors.alertSoft, borderRadius: radius.md, padding: spacing.md }}>
              <Text style={[typography.body, { fontWeight: '700' }]}>{t.testFail}</Text>
            </View>
          )}
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <ActionButton onPress={onNextFromStep1} accessibilityLabel={t.nextButton} disabled={test === 'testing'}>
              {t.nextButton}
            </ActionButton>
            <ActionButton onPress={() => onFinish(true)} variant="secondary" accessibilityLabel={t.skipButton}>
              {t.skipButton}
            </ActionButton>
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[typography.h2, { color: colors.textPrimary }]}>{t.step2Title}</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 24 }]}>
            {t.step2Body}
          </Text>
          <Text style={[typography.body, { fontWeight: '700', marginTop: spacing.lg }]}>{t.farmLabel}</Text>
          <TextInput
            value={farmName}
            onChangeText={setFarmName}
            placeholder={t.farmPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={inputStyle}
            accessibilityLabel={t.farmLabel}
          />
          <Text style={[typography.body, { fontWeight: '700', marginTop: spacing.md }]}>{t.penLabel}</Text>
          <TextInput
            value={penName}
            onChangeText={setPenName}
            placeholder={t.penPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={inputStyle}
            accessibilityLabel={t.penLabel}
          />
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <ActionButton onPress={() => { press(); setStep(3); }} accessibilityLabel={t.nextButton}>
              {t.nextButton}
            </ActionButton>
            <ActionButton onPress={() => { press(); setStep(1); }} variant="secondary" accessibilityLabel={t.backButton}>
              {t.backButton}
            </ActionButton>
          </View>
        </View>
      )}

      {step === 3 && (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[typography.h2, { color: colors.textPrimary }]}>{t.step3Title}</Text>
          <Text style={[typography.body, { marginTop: spacing.sm, lineHeight: 24 }]}>{t.step3BodyHealthy}</Text>
          <View style={{ marginTop: spacing.lg }}>
            <ActionButton onPress={() => onFinish(false)} accessibilityLabel={t.finishButton}>
              {t.finishButton}
            </ActionButton>
          </View>
        </View>
      )}
    </ScrollView>
  );
}