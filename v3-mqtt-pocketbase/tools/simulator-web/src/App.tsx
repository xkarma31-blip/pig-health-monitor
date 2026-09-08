import { useEffect, useMemo, useRef, useState } from 'react';
import { VirtualEsp32Node } from './engines/virtualEsp32';
import { decodeBase64Frame } from './engines/thermalEngine';
import { CanonAlertPayload, CanonTelemetryPayload } from './types/canonMqtt';
import { VirtualHardwareState } from './types/virtualNode';

import { TopNav } from './components/TopNav';
import { SwineArena, type ArenaPig } from './components/SwineArena';
import { ThermalHeatmap } from './components/ThermalHeatmap';
import { AudioSpectrogram } from './components/AudioSpectrogram';
import { BioacousticsStudio, type CoughFormant } from './components/BioacousticsStudio';
import { ComputeLatencyHud } from './components/ComputeLatencyHud';
import { HardwareMonitor } from './components/HardwareMonitor';
import { ChaosPanel, type ChaosPanelValue, DEFAULT_CHAOS_VALUE } from './components/ChaosPanel';
import { OtaDialog } from './components/OtaDialog';

// Canonical formant frequencies (shared with the ESP32 DSP design).
const INFECTIOUS_FORMANT_HZ = 600;
const NON_INFECTIOUS_FORMANT_HZ = 1600;

// One Ambient frame shown before the first telemetry tick arrives.
const DEFAULT_FRAME = new Float32Array(32 * 24).fill(30);

/**
 * Live cockpit: a single VirtualEsp32Node ticks every 250 ms (4 Hz — the
 * same cadence the bridge would deliver). Every panel reads from the SAME
 * node snapshot, so telemetry, alerts, arena, heatmap and hardware never
 * disagree. Audio only ever plays from a user gesture.
 */
export default function App() {
  // The node lives for the lifetime of the app (useRef init-once — safe in StrictMode).
  const nodeRef = useRef<VirtualEsp32Node | null>(null);
  if (nodeRef.current === null) {
    nodeRef.current = new VirtualEsp32Node({ seed: 0x50a5eed, initialBatteryPct: 88 });
  }
  const node = nodeRef.current;

  const [accessible, setAccessible] = useState(false);
  const [formant, setFormant] = useState<CoughFormant>('INFECTIOUS');
  const [chaos, setChaos] = useState<ChaosPanelValue>(DEFAULT_CHAOS_VALUE);
  const [otaOpen, setOtaOpen] = useState(true);

  const [telemetry, setTelemetry] = useState<CanonTelemetryPayload | null>(null);
  const [alerts, setAlerts] = useState<CanonAlertPayload[]>([]);
  const [snapshot, setSnapshot] = useState<VirtualHardwareState | null>(null);
  const [droppedCount, setDroppedCount] = useState(0);

  // ---- simulation loop ----------------------------------------------------
  useEffect(() => {
    const iv = window.setInterval(() => {
      const r = node.tick();
      setSnapshot(r.snapshot);
      if (r.telemetry) setTelemetry(r.telemetry);
      if (r.alert && r.alert.length > 0) setAlerts(r.alert);
      if (r.dropped) setDroppedCount((c) => c + 1);
    }, 250);
    return () => window.clearInterval(iv);
  }, [node]);

  // ---- chaos monkey → node (epoch-bumped, applied mid-run) ----------------
  useEffect(() => {
    node.injectChaos({
      packetLossRate: chaos.packetLossRate,
      i2cLockupTrigger: chaos.i2cLockupTrigger,
      forceBrownout: chaos.forcedBrownout,
      batterySagMv: chaos.batterySagMv
    });
  }, [chaos, node]);

  // ---- derived views -------------------------------------------------------
  const thermalFrame = useMemo(
    () => (telemetry ? decodeBase64Frame(telemetry.thermalFrame) : DEFAULT_FRAME),
    [telemetry]
  );

  const arenaPigs: ArenaPig[] = useMemo(() => {
    const t = telemetry;
    if (!t) {
      return [{ id: 'd0wd-01', x: 0.52, y: 0.52, temp: 38.6, state: 'NORMAL' }];
    }
    return [
      {
        id: t.pigId,
        // The firmware's argmax hotspot (targetX/targetY) IS the pig's position.
        x: Math.min(0.95, Math.max(0.05, t.targetX / 31)),
        y: Math.min(0.95, Math.max(0.05, t.targetY / 23)),
        temp: t.bodyTemp,
        state: t.status === 'CRITICAL' ? 'CRITICAL' : t.status === 'WARNING' ? 'WARNING' : 'NORMAL'
      }
    ];
  }, [telemetry]);

  const lastAlert = alerts[alerts.length - 1] ?? null;

  return (
    <div className={`app-shell ${accessible ? 'accessible' : ''}`}>
      <TopNav accessible={accessible} onToggleAccessible={setAccessible} />

      <header className="status-bar" data-testid="status-bar">
        <span className="badge badge-simulated">SIMULATED</span>
        <span>Uptime {snapshot ? snapshot.uptimeSeconds.toFixed(2) : '0.00'}s</span>
        <span>
          FreeRTOS <b>{snapshot?.state ?? 'BOOT'}</b>
        </span>
        <span>Dropped {droppedCount}</span>
        {telemetry && (
          <span>
            Body {telemetry.bodyTemp.toFixed(1)}°C · Battery {telemetry.batteryPct.toFixed(1)}% ·
            RSSI {telemetry.wifiRssi} dBm · Trend{' '}
            <b>{String(telemetry.healthTrend).toUpperCase()}</b>
          </span>
        )}
      </header>

      {lastAlert && (
        <div className="alert-banner" data-testid="alert-banner" role="alert">
          <b>{lastAlert.type}</b> — {lastAlert.message}
          {lastAlert.pigId && (
            <span>
              {' '}
              (pig {lastAlert.pigId}, value {lastAlert.value.toFixed(1)} vs threshold{' '}
              {lastAlert.threshold.toFixed(1)})
            </span>
          )}
        </div>
      )}

      <main className="cockpit-grid">
        <section className="panel panel-arena">
          <h2>Swine Arena</h2>
          <SwineArena pigs={arenaPigs} accessible={accessible} />
        </section>

        <section className="panel">
          <h2>Thermal Heatmap</h2>
          <ThermalHeatmap frame={thermalFrame} accessible={accessible} />
        </section>

        <section className="panel">
          <h2>Audio Spectrogram</h2>
          <AudioSpectrogram
            sampleRate={8000}
            formantHz={formant === 'INFECTIOUS' ? INFECTIOUS_FORMANT_HZ : NON_INFECTIOUS_FORMANT_HZ}
            accessible={accessible}
          />
        </section>

        <section className="panel">
          <h2>Bioacoustics Studio</h2>
          <BioacousticsStudio formant={formant} onFormantChange={setFormant} accessible={accessible} />
        </section>

        <section className="panel">
          <h2>Pi 5 Compute Budget</h2>
          <ComputeLatencyHud accessible={accessible} />
        </section>

        <section className="panel">
          <h2>Hardware Monitor</h2>
          <HardwareMonitor
            batteryPct={snapshot?.batteryPct ?? 88}
            freeHeap={snapshot?.freeHeapBytes ?? 145200}
            wifiRssi={snapshot?.wifiRssiDbm ?? -68}
            accessible={accessible}
          />
        </section>

        <section className="panel">
          <h2>Chaos Monkey</h2>
          <ChaosPanel value={chaos} onChange={setChaos} accessible={accessible} />
        </section>
      </main>

      {otaOpen && (
        <div className="ota-overlay">
          <OtaDialog accessible={accessible} onClose={() => setOtaOpen(false)} />
        </div>
      )}
    </div>
  );
}