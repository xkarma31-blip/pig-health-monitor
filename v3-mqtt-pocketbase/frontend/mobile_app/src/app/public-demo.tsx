/**
 * Public demo — no login, read-only, live data.
 *
 * Served on EAS Hosting (Cloudflare) at /public-demo. It uses only the public
 * same-origin API routes (/api/pi, /api/telemetry), which carry the server-side
 * key — no credentials reach the browser. It is a screening/demo surface, not a
 * clinical instrument.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useTheme } from '../theme';

type Esp = { connected?: boolean; peer?: string; nonzeroPct?: number; rate?: number };
type Cough = {
  enabled?: boolean;
  aggregate?: { verdict?: string; windows?: number; rate_pct?: number | null };
};
type TelemetryRow = {
  deviceId?: string; center?: number; ambient?: number; timestamp?: number; created?: string;
};
type ThermalFrame = {
  center?: number; max?: number; ambient?: number; fps?: number; ts?: number; ok?: boolean;
};
type AlertRow = { type?: string; deviceId?: string; message?: string; created?: string };

const REFRESH_MS = 10_000;

async function getJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function PublicDemoScreen() {
  const { theme } = useTheme();
  const [esp, setEsp] = useState<Esp | null>(null);
  const [cough, setCough] = useState<Cough | null>(null);
  const [frame, setFrame] = useState<ThermalFrame | null>(null);
  const [thermal, setThermal] = useState<TelemetryRow | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [updated, setUpdated] = useState<string>('—');
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const [e, c, f, t, a] = await Promise.all([
      getJSON<Esp>('/api/pi?ep=esp/status'),
      getJSON<Cough>('/api/pi?ep=cough/api/status'),
      getJSON<ThermalFrame>('/api/pi?ep=data'),
      getJSON<{ items?: TelemetryRow[] }>(
        '/api/telemetry?collection=telemetry&perPage=10&sort=-timestamp',
      ),
      getJSON<{ items?: AlertRow[] }>(
        '/api/telemetry?collection=alerts&perPage=10&sort=-created',
      ),
    ]);
    setEsp(e);
    setCough(c);
    setFrame(f);
    const rows = t?.items ?? [];
    setThermal(rows.find((r) => r.deviceId === 'pi-thermal-01') ?? rows[0] ?? null);
    // Hide the two known test/verification artifacts from the public demo.
    setAlerts(
      (a?.items ?? []).filter(
        (x) => x.type !== 'VERIFICATION' && !/0\.0000/.test(x.message || ''),
      ),
    );
    setUpdated(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Schedule the first load outside the effect body so the state flip happens
    // in an async callback (avoids cascading renders / the lint rule).
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.textPrimary }}>Open this page in a browser.</Text>
      </View>
    );
  }

  const live = esp?.connected === true;
  const pct = Number(esp?.nonzeroPct ?? 0);
  const coughActive = cough?.enabled === true && !!cough.aggregate;
  const verdict = cough?.aggregate?.verdict ?? '—';
  const windows = cough?.aggregate?.windows ?? 0;
  const rate = cough?.aggregate?.rate_pct;
  const frameAgeS = frame && frame.ts ? Math.max(0, (now - frame.ts) / 1000) : null;

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.wrap}>
      <Text style={styles.h1}>PigPulse</Text>
      <Text style={styles.sub}>Public demo · read-only · screening only, not a clinical device</Text>

      <Card title="Barn mic">
        <Row k="Ingest" v={live ? 'LIVE' : 'OFFLINE'} tone={live ? 'ok' : 'bad'} />
        <Row k="Peer" v={esp?.peer || '—'} />
        <Row k="Signal (non-zero)" v={`${pct.toFixed(1)} %`} />
        <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, pct))}%` }]} /></View>
      </Card>

      <Card title="Thermal scene">
        <Row k="Centre" v={frame?.center ?? thermal?.center} big />
        <Row k="Max" v={frame?.max} />
        <Row k="Ambient" v={frame?.ambient ?? thermal?.ambient} />
        <Row k="Frame rate" v={frame?.fps} />
        <Row k="Frame age" v={frameAgeS !== null ? `${frameAgeS.toFixed(1)} s` : '—'} />
        <Row k="Status" v={frame?.ok ? 'frame valid' : 'no valid frame'} />
        <Text style={styles.note}>Scene screening only. A scene-centre value is not an animal temperature.</Text>
      </Card>

      <Card title="Cough classifier">
        <Row k="State" v={coughActive ? 'ACTIVE' : 'OFFLINE'} tone={coughActive ? 'ok' : 'bad'} />
        <Row k="Verdict (60 s)" v={verdict} />
        <Row k="Windows scored" v={String(windows)} />
        <Row k="Over threshold" v={rate !== null && rate !== undefined ? `${rate.toFixed(1)} %` : '—'} />
        <Text style={styles.note}>Ranks, does not diagnose. At the operating threshold there are false positives.</Text>
      </Card>

      <Card title="Recent alerts">
        {alerts.length === 0 ? (
          <Text style={styles.muted}>No alerts recorded.</Text>
        ) : (
          alerts.map((a, i) => (
            <View key={`${a.created}-${i}`} style={styles.alert}>
              <Text style={styles.alertTitle}>{a.type || 'ALERT'} · {a.deviceId || ''}</Text>
              <Text style={styles.muted} numberOfLines={3}>{a.message || ''}</Text>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.footer}>Updated {updated} · refreshes every {REFRESH_MS / 1000} s</Text>
      <Link href="/web" style={styles.link}>Technician sign-in →</Link>
    </ScrollView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]}>
      <Text style={[styles.cardTitle, { color: theme.colors.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ k, v, tone, big }: { k: string; v: string | number | null | undefined; tone?: 'ok' | 'bad'; big?: boolean }) {
  const { theme } = useTheme();
  const color = tone === 'ok' ? theme.colors.healthy : tone === 'bad' ? theme.colors.alert : theme.colors.textPrimary;
  const text = v === null || v === undefined || v === '' ? '—' : String(v);
  return (
    <View style={styles.row}>
      <Text style={[styles.k, { color: theme.colors.textSecondary }]}>{k}</Text>
      <Text style={[big ? styles.big : styles.v, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 30, fontWeight: '800', color: '#39d0d8', letterSpacing: 0.4 },
  sub: { color: '#9aa7b4', fontSize: 14, marginBottom: 14 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  k: { fontSize: 15 },
  v: { fontSize: 15, fontWeight: '700', textAlign: 'right', flexShrink: 0 },
  big: { fontSize: 30, fontWeight: '800', textAlign: 'right', flexShrink: 0 },
  bar: { height: 10, backgroundColor: '#0b0f14', borderRadius: 5, overflow: 'hidden', marginTop: 8 },
  barFill: { height: '100%', backgroundColor: '#3ddc84' },
  note: { color: '#9aa7b4', fontSize: 12, marginTop: 8 },
  muted: { color: '#9aa7b4', fontSize: 13 },
  alert: { borderLeftWidth: 3, borderLeftColor: '#ffb454', backgroundColor: 'rgba(255,180,84,0.08)', borderRadius: 6, padding: 8, marginBottom: 8 },
  alertTitle: { fontWeight: '800', fontSize: 13, marginBottom: 2 },
  footer: { color: '#9aa7b4', fontSize: 12, textAlign: 'center', marginTop: 6 },
  link: { color: '#39d0d8', fontSize: 14, textAlign: 'center', marginTop: 12, fontWeight: '700' },
});