import { useEffect, useMemo, useRef, useState } from 'react';
import { BarnEnvironment, REAL_HERD, createRng } from './engines/environment';
import { SensorFarm, type FarmTelemetryRecord, type SensorNodeState } from './engines/sensorFarm';
import { VirtualEsp32Node } from './engines/virtualEsp32';
import { runInferenceChain, type TrendLabel } from './engines/inferenceChain';
import { generateCoughBurst } from './engines/audioSynthesizer';
import { PipelineTracer, type PipelineEvent } from './engines/pipelineTrace';
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
import { BarnPanel, type BarnPigView } from './components/BarnPanel';
import { ClassifierPanel, type ClassifierView } from './components/ClassifierPanel';
import { PipelineTrace } from './components/PipelineTrace';
import { ScenarioRunner } from './components/ScenarioRunner';
import { SceneEditor } from './components/SceneEditor';
import { EnvironmentConsole } from './components/EnvironmentConsole';
import { BackendInspector } from './components/BackendInspector';

// Canonical formant frequencies (shared with the ESP32 DSP design).
const INFECTIOUS_FORMANT_HZ = 600;
const NON_INFECTIOUS_FORMANT_HZ = 1600;

// One Ambient frame shown before the first telemetry tick arrives.
const DEFAULT_FRAME = new Float32Array(32 * 24).fill(30);

// Simulation constants (must match the offline scenario runner in engines/).
const SIM_SAMPLE_RATE = 8000;
const COUGH_WINDOW_SEC = 30;
const AUDIO_RING_SEC = 4;
const BARN_SEED = 0xb0ba5eed;
/** Fallback watched pig before the farm resolves coverage (real herd). */
const FALLBACK_WATCHED = 'pig-001';
/** Measured 2026-09-08: systemd NRestarts for the crash-looping bridge. */
const BRIDGE_RESTARTS_MEASURED = 5347;
/** Live placement: same ids/battery as the measured `devices` collection. */
const FARM_START: Array<{ id: string; x: number; y: number; batteryPct: number }> = [
  { id: 'esp32-001', x: 0.35, y: 0.35, batteryPct: 78 },
  { id: 'esp32-002', x: 0.7, y: 0.7, batteryPct: 77 }
];

interface WatchdogState {
  audio: Float32Array;
  coughs: Array<{ t: number; count: number }>;
  lastSec: number;
  simTime: number;
  infections: Array<{ pigId: string; sourceId: string }>;
  events: string[];
}

/**
 * Live cockpit (v3): one BarnEnvironment (REAL herd from the measured `pigs`
 * collection) is ground truth; a SensorFarm of esp32 nodes watches the nearest
 * in-coverage pig, and the watchdog runs the SAME pipeline the offline
 * scenarios assert (cough ring → STFT/Mel → classifier → node.setEnvironment →
 * firmware alerts → trace). The causal loop on screen is the loop the tests
 * prove — now with placeable/replaceable hardware and a live backend inspector.
 */
export default function App() {
  const envRef = useRef<BarnEnvironment | null>(null);
  if (envRef.current === null) {
    envRef.current = new BarnEnvironment({ pigs: REAL_HERD, seed: BARN_SEED });
  }
  const env = envRef.current;

  const farmRef = useRef<SensorFarm | null>(null);
  if (farmRef.current === null) {
    farmRef.current = new SensorFarm(
      FARM_START.map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        coverageRadius: 0.5,
        batteryPct: n.batteryPct
      }))
    );
  }
  const farm = farmRef.current;

  const nodeRef = useRef<VirtualEsp32Node | null>(null);
  if (nodeRef.current === null) {
    nodeRef.current = new VirtualEsp32Node({ seed: 0x50a5eed, initialBatteryPct: 88 });
  }
  const node = nodeRef.current;

  const tracerRef = useRef<PipelineTracer | null>(null);
  if (tracerRef.current === null) tracerRef.current = new PipelineTracer(300);
  const tracer = tracerRef.current;

  const wdRef = useRef<WatchdogState | null>(null);
  if (wdRef.current === null) {
    wdRef.current = {
      audio: new Float32Array(AUDIO_RING_SEC * SIM_SAMPLE_RATE),
      coughs: [],
      lastSec: 0,
      simTime: 0,
      infections: [],
      events: []
    };
  }

  const [accessible, setAccessible] = useState(false);
  const [formant, setFormant] = useState<CoughFormant>('INFECTIOUS');
  const [chaos, setChaos] = useState<ChaosPanelValue>(DEFAULT_CHAOS_VALUE);
  const [otaOpen, setOtaOpen] = useState(true);
  const [speed, setSpeed] = useState(1);
  // sim speed read by the interval closure without re-binding the loop.
  const speedRef = useRef(speed);
  const [params, setParamsState] = useState<typeof env.ambient>(env.ambient);

  const [telemetry, setTelemetry] = useState<CanonTelemetryPayload | null>(null);
  const [farmTlm, setFarmTlm] = useState<FarmTelemetryRecord | null>(null);
  const [alerts, setAlerts] = useState<CanonAlertPayload[]>([]);
  const [snapshot, setSnapshot] = useState<VirtualHardwareState | null>(null);
  const [droppedCount, setDroppedCount] = useState(0);

  const [barnPigs, setBarnPigs] = useState<BarnPigView[]>(() => env.snapshot());
  const [farmNodes, setFarmNodes] = useState<SensorNodeState[]>(() => farm.collectSnapshot(env.snapshot()));
  const [simTimeSec, setSimTimeSec] = useState(0);
  const [ambientNow, setAmbientNow] = useState(() => env.ambientTemp);
  const [ai, setAi] = useState<ClassifierView | null>(null);
  const [traceEvents, setTraceEvents] = useState<PipelineEvent[]>(() => tracer.snapshot());

  // Place a cough burst into the audible ring at the current second segment.
  const placeBurst = (t: number, count: number, wd: WatchdogState) => {
    const rng = createRng((BARN_SEED ^ Math.round(t * 1000)) >>> 0);
    for (let i = 0; i < count; i++) {
      const burst = generateCoughBurst('INFECTIOUS', 300, SIM_SAMPLE_RATE, rng);
      const segStart = ((t % AUDIO_RING_SEC) * SIM_SAMPLE_RATE) | 0;
      const offset = segStart + Math.floor(rng() * Math.max(1, SIM_SAMPLE_RATE - burst.length));
      if (offset + burst.length <= wd.audio.length) wd.audio.set(burst, offset);
    }
  };

  // ---- simulation loop ----------------------------------------------------
  useEffect(() => {
    const iv = window.setInterval(() => {
      const wd = wdRef.current!;

      // 1) Ground truth: advance the barn at sim speed.
      const tickRes = env.tick(0.25 * speedRef.current);
      wd.simTime = tickRes.timeSec;
      for (const c of tickRes.coughs) {
        if (c.count > 0) {
          wd.coughs.push({ t: tickRes.timeSec, count: c.count });
          placeBurst(tickRes.timeSec, c.count, wd);
          tracer.push('SENSOR', tickRes.timeSec, `coughs x${c.count}`, c.pigId, true);
        }
      }
      if (tickRes.infections) {
        for (const i of tickRes.infections) {
          wd.infections.push(i);
          tracer.push('SENSOR', tickRes.timeSec, `INFECT ${i.pigId}`, `source ${i.sourceId}`, true);
        }
      }
      if (tickRes.events) {
        wd.events = tickRes.events.map((e) => e.name);
      }
      setAmbientNow(tickRes.ambientNow ?? env.ambientTemp);

      // 2) Hardware layer: nodes watch the nearest in-coverage pig and publish.
      const farmRes = farm.tick(env.snapshot());
      setFarmNodes(farmRes.nodes);
      if (farmRes.alerts.length > 0) setAlerts((prev) => [...prev, ...farmRes.alerts.map((a) => a.alert)]);
      setDroppedCount((c) => c + farmRes.drops.length);
      const n1 = farmRes.raw.find((r) => r.deviceId === 'esp32-001');
      const tlm1 = farmRes.telemetry.find((r) => r.deviceId === 'esp32-001');
      if (n1?.telemetry) setTelemetry(n1.telemetry);
      if (tlm1) setFarmTlm(tlm1);
      const watchedPigId =
        farmRes.nodes.find((n) => n.id === 'esp32-001')?.watchedPigId ?? FALLBACK_WATCHED;

      // 3) Watchdog pipeline once per simulated second, on the WATCHED pig.
      const t = tickRes.timeSec;
      const whole = Math.abs(t - Math.round(t)) < 1e-9 && t !== wd.lastSec;
      if (whole) {
        wd.lastSec = t;
        const watched = env.pig(watchedPigId) ?? env.pig(FALLBACK_WATCHED)!;
        const windowCount = wd.coughs
          .filter((e) => e.t > t - COUGH_WINDOW_SEC)
          .reduce((a, e) => a + e.count, 0);
        const inference = runInferenceChain(wd.audio, windowCount, SIM_SAMPLE_RATE);
        tracer.push('DSP', t, 'stft+mel', `${inference.melFrames.length} frames`, true);
        tracer.push(
          'ML',
          t,
          `s=${inference.scores.stable.toFixed(2)} e=${inference.scores.elevated.toFixed(2)} c=${inference.scores.cluster.toFixed(2)}`,
          `trend=${inference.trend} conf=${inference.confidence.toFixed(2)}`,
          true
        );

        node.setEnvironment({
          bodyTemp: watched.coreTemp,
          coughRate: Math.round(windowCount * (60 / COUGH_WINDOW_SEC)),
          trend: inference.trend,
          position: { x: watched.x, y: watched.y }
        });

        setAi({
          melFrames: inference.melFrames,
          scores: inference.scores,
          trend: inference.trend,
          confidence: inference.confidence,
          coughCount: windowCount
        });

        // Slide the audio ring forward one second.
        wd.audio.copyWithin(0, SIM_SAMPLE_RATE);
        wd.audio.fill(0, wd.audio.length - SIM_SAMPLE_RATE);
        wd.coughs = wd.coughs.filter((e) => e.t > t - COUGH_WINDOW_SEC * 2);
      }

      // 4) Pipeline trace for the last farm publish (device-agnostic display).
      const r = node.tick();
      setSnapshot(r.snapshot);
      if (r.telemetry) {
        tracer.push('DECISION', t, 'firmware telemetry', `temp=${r.telemetry.bodyTemp.toFixed(1)}`, true);
        tracer.push('MQTT', t, `pub pig/${watchedPigId}/telemetry`, undefined, true);
        tracer.push('BRIDGE', t, 'mqtt->pocketbase bridge', undefined, true);
        tracer.push('DB', t, 'pocketbase insert', undefined, true);
      }
      if (r.alert && r.alert.length > 0) {
        for (const a of r.alert) {
          tracer.push('DECISION', t, `alert ${a.type}`, `${a.severity} ${a.value.toFixed(1)}°C`, false);
          tracer.push('MQTT', t, `pub pig/${watchedPigId}/alerts`, a.type, false);
          tracer.push('BRIDGE', t, 'alert persisted', undefined, true);
          tracer.push('DB', t, 'alert record inserted', undefined, true);
        }
      }

      setBarnPigs(env.snapshot());
      setSimTimeSec(t);
      setTraceEvents(tracer.snapshot());
    }, 250);
    return () => window.clearInterval(iv);
  }, [env, node, tracer, farm]);

  // Keep the interval's speedRef in sync with the speed control.
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const setParams = (p: Partial<typeof params>) => {
    env.setParams(p);
    setParamsState(env.ambient);
  };

  // ---- chaos monkey → node (epoch-bumped, applied mid-run) ----------------
  useEffect(() => {
    node.injectChaos({
      packetLossRate: chaos.packetLossRate,
      i2cLockupTrigger: chaos.i2cLockupTrigger,
      forceBrownout: chaos.forcedBrownout,
      batterySagMv: chaos.batterySagMv
    });
  }, [chaos, node]);

  const scriptInfection = (pigId: string) => {
    env.setHealth(pigId, 'INFECTED');
    tracer.push('SENSOR', wdRef.current!.simTime, `INFECT ${pigId}`, 'scripted via barn', false);
    setBarnPigs(env.snapshot());
  };

  // ---- scene editing ------------------------------------------------------
  const addPig = () => {
    const n = env.pigCount + 1;
    env.addPig({ id: `pig-${String(n).padStart(3, '0')}`, name: `Pig ${n}` });
    setBarnPigs(env.snapshot());
  };
  const removePig = (pigId: string) => {
    if (env.pigCount <= 1) return;
    env.removePig(pigId);
    setBarnPigs(env.snapshot());
  };
  const movePig = (pigId: string, x: number, y: number) => {
    env.movePig(pigId, x, y);
    setBarnPigs(env.snapshot());
  };
  const addNode = () => {
    const n = farm.nodeIds.length + 1;
    farm.addNode({
      id: `esp32-${String(n).padStart(3, '0')}`,
      x: 0.5,
      y: 0.5,
      coverageRadius: 0.5,
      batteryPct: 90
    });
    setFarmNodes(farm.collectSnapshot(env.snapshot()));
  };

  // ---- derived views -------------------------------------------------------
  const thermalFrame = useMemo(
    () => (telemetry ? decodeBase64Frame(telemetry.thermalFrame) : DEFAULT_FRAME),
    [telemetry]
  );

  const arenaPigs: ArenaPig[] = useMemo(() => {
    const t = telemetry;
    if (!t) {
      return [{ id: FALLBACK_WATCHED, x: 0.52, y: 0.52, temp: 38.6, state: 'NORMAL' }];
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
  const watchedPig = barnPigs.find((p) => p.id === farmNodes.find((n) => n.id === 'esp32-001')?.watchedPigId);

  return (
    <div className={`app-shell ${accessible ? 'accessible' : ''}`}>
      <TopNav accessible={accessible} onToggleAccessible={setAccessible} />

      <header className="status-bar" data-testid="status-bar">
        <span className="badge badge-simulated">SIMULATED</span>
        <span>Sim {simTimeSec.toFixed(1)}s · {speed}×</span>
        <span>
          Watch <b>{watchedPig?.name ?? watchedPig?.id ?? '—'}</b> via {farmNodes.find((n) => n.id === 'esp32-001')?.watchedPigId ?? '—'}
        </span>
        <span>
          FreeRTOS <b>{snapshot?.state ?? 'BOOT'}</b>
        </span>
        <span>Dropped {droppedCount}</span>
        {(farmTlm ?? telemetry) && (
          <span>
            Body {(farmTlm ?? telemetry)!.bodyTemp.toFixed(1)}°C · Battery {(farmTlm ?? telemetry)!.batteryPct.toFixed(1)}% ·
            RSSI {(farmTlm ?? telemetry)!.wifiRssi} dBm · Trend{' '}
            <b>{String((telemetry as CanonTelemetryPayload | null)?.healthTrend ?? 'STABLE').toUpperCase()}</b>
          </span>
        )}
        {ai && (
          <span>
            AI <b className={`trend-badge ${TREND_CLASS(ai.trend)}`}>{ai.trend}</b>
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
        <section className="panel">
          <h2>Barn Environment</h2>
          <BarnPanel
            pigs={barnPigs}
            simTimeSec={simTimeSec}
            onInfect={scriptInfection}
            accessible={accessible}
          />
        </section>

        <section className="panel">
          <h2>Scene Editor (place hardware)</h2>
          <SceneEditor
            pigs={barnPigs}
            nodes={farmNodes}
            onAddPig={addPig}
            onRemovePig={removePig}
            onMovePig={movePig}
            onAddNode={addNode}
            onRemoveNode={(id) => {
              farm.removeNode(id);
              setFarmNodes(farm.collectSnapshot(env.snapshot()));
            }}
            onMoveNode={(id, x, y) => {
              farm.moveNode(id, x, y);
              setFarmNodes(farm.collectSnapshot(env.snapshot()));
            }}
            onSetPowered={(id, powered) => {
              farm.setPowered(id, powered);
              setFarmNodes(farm.collectSnapshot(env.snapshot()));
            }}
            onSetCoverage={(id, radius) => {
              farm.setCoverage(id, radius);
              setFarmNodes(farm.collectSnapshot(env.snapshot()));
            }}
            accessible={accessible}
          />
        </section>

        <section className="panel">
          <h2>Environment Console (opt-in realism)</h2>
          <EnvironmentConsole
            params={params}
            ambientTemp={ambientNow}
            activeEvents={wdRef.current?.events ?? []}
            recentInfections={wdRef.current?.infections ?? []}
            speed={speed}
            onParamsChange={setParams}
            onEvent={(name) => env.triggerEvent(name)}
            onSpeedChange={setSpeed}
            accessible={accessible}
          />
        </section>

        <section className="panel">
          <h2>Backend Inspector (live readouts)</h2>
          <BackendInspector bridgeRestarts={BRIDGE_RESTARTS_MEASURED} accessible={accessible} />
        </section>

        <section className="panel panel-arena">
          <h2>Swine Arena</h2>
          <SwineArena pigs={arenaPigs} accessible={accessible} />
        </section>

        <section className="panel">
          <h2>Thermal Heatmap</h2>
          <ThermalHeatmap frame={thermalFrame} accessible={accessible} />
        </section>

        <section className="panel">
          <h2>AI Classifier (STFT→Mel→readout)</h2>
          <ClassifierPanel view={ai} accessible={accessible} />
        </section>

        <section className="panel">
          <h2>Pipeline Trace</h2>
          <PipelineTrace events={traceEvents} accessible={accessible} />
        </section>

        <section className="panel">
          <h2>Scenario Runner (same engine as tests)</h2>
          <ScenarioRunner accessible={accessible} />
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
            batteryPct={farmTlm?.batteryPct ?? snapshot?.batteryPct ?? 88}
            freeHeap={snapshot?.freeHeapBytes ?? 145200}
            wifiRssi={farmTlm?.wifiRssi ?? snapshot?.wifiRssiDbm ?? -68}
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

function TREND_CLASS(trend: TrendLabel): string {
  return trend === 'STABLE' ? 'trend-stable' : trend === 'ELEVATED' ? 'trend-elevated' : 'trend-cluster';
}