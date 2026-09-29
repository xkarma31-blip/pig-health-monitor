/**
 * Main simulation tick loop — drives all 18 engines and writes into Zustand stores.
 *
 * Runs a 250 ms setInterval that advances BarnEnvironment, generates thermal
 * frames, compensates sunlight, upscales, runs audio inference, tracks zones,
 * filters false positives, computes fusion scores, and updates SoundTalks.
 *
 * Side-effect hook: call once at the top of AppRouter.
 */
import { useEffect, useRef } from 'react';
import { useSimulationStore } from '../stores/simulationStore';
import { useSettingsStore } from '../stores/settingsStore';
import { BarnEnvironment, REAL_HERD } from '../engines/environment';
import { generateThermalFrame, SimulatedPig } from '../engines/thermalEngine';
import { generateCoughBurst } from '../engines/audioSynthesizer';
import { SunlightCompensator } from '../engines/sunlightCompensator';
import { superResolve } from '../engines/superResolution';
import { FalsePositiveFilter } from '../engines/falsePositiveFilter';
import { ZoneTracker } from '../engines/zoneTracker';
import { PigZoneMapper } from '../engines/pigZoneMapper';
import { SoundTalks, SIM_DAY_SEC } from '../engines/soundTalks';
import { runInferenceChain, CLASSIFIER_SAMPLE_RATE } from '../engines/inferenceChain';
import { fuseMultiMic, MicCoverage } from '../engines/distanceAttenuation';
import { useAudioSynthesis } from './useAudioSynthesis';
import type { SimZone, SimPig } from '../stores/simulationStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pigToSimPig(id: string, name: string, x: number, y: number, temp: number): SimulatedPig {
  return { id, name, x: x * 31, y: y * 23, baseTemp: temp, angleRad: 0, inFov: true };
}

function zoneIndexForPig(x: number, y: number): number {
  const col = x < 0.5 ? 0 : 1;
  const row = y < 0.5 ? 0 : 1;
  return row * 2 + col;
}

function buildZoneMap(): number[] {
  const map = new Array<number>(32 * 24);
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 32; x++) {
      map[y * 32 + x] = (x < 16 ? 0 : 1) + (y < 12 ? 0 : 2);
    }
  }
  return map;
}

function computeHealth(health: string, temp: number, threshold: number): SimPig['health'] {
  if (health === 'CRITICAL' || temp >= threshold) return 'fever';
  if (health === 'INFECTED') return 'elevated';
  return 'healthy';
}

function generateNoise(length: number, levelDb: number): Float32Array {
  const amp = Math.pow(10, levelDb / 20);
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) buf[i] = (Math.random() * 2 - 1) * amp * 0.01;
  return buf;
}

function applyGain(buf: Float32Array, mode: 'agc' | 'fixed'): Float32Array {
  if (mode === 'fixed') return buf;
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak < 1e-6) return buf;
  const target = Math.pow(10, -3 / 20);
  const gain = target / peak;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * gain;
  return out;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const ZONE_MAP = buildZoneMap();

export function useSimulationLoop(): void {
  const { addCoughAudio, getAudioBuffer } = useAudioSynthesis();

  const envRef = useRef<BarnEnvironment | null>(null);
  const sunRef = useRef<SunlightCompensator | null>(null);
  const fpRef = useRef<FalsePositiveFilter | null>(null);
  const zoneRef = useRef<ZoneTracker | null>(null);
  const mapperRef = useRef<PigZoneMapper | null>(null);
  const stRef = useRef<SoundTalks | null>(null);
  const lastAudioSecRef = useRef(-1);
  const lastBaselineSecRef = useRef(0);

  if (!envRef.current) envRef.current = new BarnEnvironment({ pigs: REAL_HERD });
  if (!sunRef.current) sunRef.current = new SunlightCompensator();
  if (!fpRef.current) fpRef.current = new FalsePositiveFilter();
  if (!zoneRef.current) zoneRef.current = new ZoneTracker(4);
  if (!mapperRef.current) mapperRef.current = new PigZoneMapper();
  if (!stRef.current) stRef.current = new SoundTalks();

  useEffect(() => {
    const id = setInterval(() => {
      const sim = useSimulationStore.getState();
      const settings = useSettingsStore.getState();
      if (!sim.isRunning) return;

      const env = envRef.current;
      const sun = sunRef.current;
      const fp = fpRef.current;
      const zoneTracker = zoneRef.current;
      const st = stRef.current;
      if (!env || !sun || !fp || !zoneTracker || !st) return;
      const dt = 0.25 * sim.speed;

      // ── 1. Advance environment ──────────────────────────────────────────
      const tick = env.tick(dt);

      // ── 2. Update pigs ─────────────────────────────────────────────────
      const pigs: SimPig[] = tick.pigs.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        temp: p.coreTemp,
        zoneId: zoneIndexForPig(p.x, p.y),
        health: computeHealth(p.health, p.coreTemp, settings.feverThreshold),
      }));
      useSimulationStore.getState().updatePigs(pigs);
      useSimulationStore.setState({ simTime: tick.timeSec, timeOfDay: env.timeOfDaySec });

      // ── 3. Cough events + audio ────────────────────────────────────────
      for (const c of tick.coughs) {
        for (let i = 0; i < c.count; i++) {
          useSimulationStore.getState().addCoughEvent({
            t: tick.timeSec,
            confidence: 0.7 + Math.random() * 0.3,
            distance: 1 + Math.random() * 3,
            pigId: c.pigId,
          });
          const type = pigs.find((p) => p.id === c.pigId)?.health === 'healthy'
            ? 'NON_INFECTIOUS' as const
            : 'INFECTIOUS' as const;
          addCoughAudio(generateCoughBurst(type, 300, CLASSIFIER_SAMPLE_RATE));
        }
      }

      // ── 4. Thermal frame ───────────────────────────────────────────────
      const simPigs = pigs.map((p) => pigToSimPig(p.id, p.id, p.x, p.y, p.temp));
      const frame = generateThermalFrame(simPigs, tick.ambientNow ?? 28.5);
      useSimulationStore.getState().updateThermalFrame(frame);

      // ── 5. Sunlight compensation ───────────────────────────────────────
      const sunState = sun.getState(env.timeOfDaySec);
      const { compensated } = sun.compensateFrame(frame, sunState, ZONE_MAP);
      useSimulationStore.setState({
        sunlightIntensity: sunState.intensity,
        thermalFrame: compensated,
      });

      // ── 6. Super resolution ────────────────────────────────────────────
      const sr = superResolve({ lowRes: compensated });
      useSimulationStore.getState().updateSuperResFrame(sr.highRes);

      // ── 7. Audio + inference (once per sim-second) ─────────────────────
      const curSec = Math.floor(tick.timeSec);
      if (curSec !== lastAudioSecRef.current) {
        lastAudioSecRef.current = curSec;
        const coughCount = tick.coughs.reduce((s, c) => s + c.count, 0);
        const noise = generateNoise(4096, sim.noiseLevel);
        const audio = getAudioBuffer();
        const combined = new Float32Array(4096);
        for (let i = 0; i < 4096; i++) combined[i] = noise[i] + (audio[i] || 0);
        const processed = applyGain(combined, sim.gainMode);
        const inference = runInferenceChain(processed, coughCount, CLASSIFIER_SAMPLE_RATE);

        if (inference.trend === 'CLUSTER' && inference.confidence > settings.coughConfidenceThreshold) {
          useSimulationStore.getState().addAlert({
            zoneId: 0,
            type: 'cough_cluster',
            confidence: inference.confidence,
            timestamp: tick.timeSec,
            modalities: ['audio'],
            dismissed: false,
          });
        }
      }

      // ── 8. Zone tracking ───────────────────────────────────────────────
      for (const pig of pigs) zoneTracker.update(pig.id, pig.x, pig.y, tick.timeSec);

      // ── 9. False-positive filtering ────────────────────────────────────
      for (let zi = 0; zi < 4; zi++) {
        const check = fp.checkZone(compensated, zi, tick.timeSec);
        if (check.compensatedFever && check.confidence > settings.coughConfidenceThreshold) {
          useSimulationStore.getState().addAlert({
            zoneId: zi,
            type: 'fever',
            confidence: check.confidence,
            timestamp: tick.timeSec,
            modalities: ['thermal'],
            dismissed: false,
          });
        }
      }

      // ── 10. SoundTalks ─────────────────────────────────────────────────
      st.record(tick.coughs.reduce((s, c) => s + c.count, 0), dt);

      // ── 11. Fusion scoring ─────────────────────────────────────────────
      const w = sim.fusionWeights;
      const micCov: MicCoverage[] = settings.micPositions.map((m) => ({
        micId: m.id, x: m.x / 6, y: m.y / 6, radius: 0.75,
      }));
      const updates: SimZone[] = sim.zones.map((z, i) => {
        const fusion = fuseMultiMic(0.5, 0.5, micCov);
        const audioConf = fusion.fusedDetection ? fusion.maxSnr / 35 : 0.1;
        const fpCheck = fp.checkZone(compensated, i, tick.timeSec);
        const thermalConf = fpCheck.compensatedFever ? fpCheck.confidence : 0.5;
        const cctvConf = 0.5;
        const score = (audioConf * w.audio + thermalConf * w.thermal + cctvConf * w.cctv) * 100;
        const clamped = Math.max(0, Math.min(100, Math.round(score)));
        const pigCount = pigs.filter((p) => zoneIndexForPig(p.x, p.y) === i).length;
        return {
          ...z,
          healthScore: clamped,
          pigCount,
          feverRisk: fpCheck.compensatedFever ? fpCheck.confidence : z.feverRisk,
          confidence: (z.confidence + fpCheck.confidence) / 2,
        };
      });
      useSimulationStore.getState().updateZones(updates);

      // ── 12. Baseline (7-day rolling, every 360 sim-seconds) ───────────
      if (tick.timeSec - lastBaselineSecRef.current >= SIM_DAY_SEC) {
        lastBaselineSecRef.current = tick.timeSec;
        const avgTemp = pigs.reduce((s, p) => s + p.temp, 0) / pigs.length;
        const coughRate = tick.coughs.reduce((s, c) => s + c.count, 0);
        const baseline = useSimulationStore.getState().baselineData;
        useSimulationStore.setState({
          baselineData: [...baseline.slice(-6), { day: baseline.length + 1, avgTemp, coughRate }],
        });
      }
    }, 250);

    return () => clearInterval(id);
  }, [addCoughAudio, getAudioBuffer]);
}
