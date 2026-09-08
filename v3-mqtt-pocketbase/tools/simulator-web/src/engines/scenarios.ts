/**
 * Scenario runner — closes the causal loop OFFLINE (vitest) and ONLINE (UI):
 *
 *   BarnEnvironment (pig gets sick) → cough audio → real STFT/Mel/classifier
 *   → node.setEnvironment (fever/cough packeteered) → firmware alerts → trace.
 *
 * The SAME engine drives the cockpit's scenario panel, so a green unit test
 * is also a green on-screen run. All RNG is seeded: verdicts are reproducible.
 */

import { BarnEnvironment, createRng, PigHealthState, FEVER_CRITICAL_TEMP } from './environment';
import { VirtualEsp32Node } from './virtualEsp32';
import { runInferenceChain, TrendLabel } from './inferenceChain';
import { generateCoughBurst } from './audioSynthesizer';
import { PipelineTracer } from './pipelineTrace';
import { CanonAlertPayload } from '../types/canonMqtt';

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  durationSec: number;
  seed: number;
  pigId: string;
  /** Sim-second at which the pig is scripted to fall ill. Omit = healthy. */
  infectAtSec?: number;
  /** Real-world aggregation window for the cough-count feature (sim seconds). */
  windowSec?: number;
}

export interface ScenarioCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface ScenarioVerdict {
  id: string;
  name: string;
  description: string;
  durationSec: number;
  passed: boolean;
  checks: ScenarioCheck[];
  alerts: CanonAlertPayload[];
  finalHealth: PigHealthState;
  finalCoreTemp: number;
  trendSamples: Array<{ tSec: number; trend: TrendLabel }>;
  trace: PipelineTracer;
}

const DT = 0.25; // environment tick (sim seconds)
const SIM_SAMPLE_RATE = 8000;
const DEFAULT_WINDOW_SEC = 30;
const AUDIO_RING_SEC = 4;

export function runScenario(def: ScenarioDefinition): ScenarioVerdict {
  const windowSec = def.windowSec ?? DEFAULT_WINDOW_SEC;
  const audioLen = AUDIO_RING_SEC * SIM_SAMPLE_RATE;

  const env = new BarnEnvironment({ pigs: [{ id: def.pigId }], seed: def.seed });
  const node = new VirtualEsp32Node({ seed: def.seed ^ 0xABCD });
  const tracer = new PipelineTracer();
  const audioRng = createRng(def.seed ^ 0xFEED);
  const alertList: CanonAlertPayload[] = [];

  const audio = new Float32Array(audioLen);
  const eventTimes: Array<{ t: number; count: number }> = [];
  const trendSamples: ScenarioVerdict['trendSamples'] = [];
  let infected = false;
  let maxBodyTempSeen = 0;
  let seconds = 0;

  tracer.push('SENSOR', 0, 'env start', `seed=${def.seed} pig=${def.pigId}`, true);

  for (let t = DT; t <= def.durationSec; t += DT) {
    // Scripted infection onset.
    if (def.infectAtSec !== undefined && !infected && t >= def.infectAtSec) {
      infected = true;
      env.setHealth(def.pigId, 'INFECTED');
      tracer.push('SENSOR', t, 'INFECT', 'scripted infection onset', false);
    }

    const tickRes = env.tick(DT);
    for (const c of tickRes.coughs) {
      if (c.count > 0) {
        eventTimes.push({ t, count: c.count });
        // Place a burst in the audible ring at the current second's segment.
        const burst = generateCoughBurst('INFECTIOUS', 300, SIM_SAMPLE_RATE, audioRng);
        const segStart = ((t % AUDIO_RING_SEC) * SIM_SAMPLE_RATE) | 0;
        const offset = segStart + Math.floor(audioRng() * Math.max(1, SIM_SAMPLE_RATE - burst.length));
        if (offset + burst.length <= audioLen) audio.set(burst, offset);
        tracer.push('SENSOR', t, `coughs x${c.count}`);
      }
    }

    // Second boundary → run the full pipeline once per sim second.
    if (Math.abs(t - Math.round(t)) < 1e-9) {
      seconds++;
      const now = t;

      // 1) DSP + ML — real features over the ring + windowed cough count.
      const windowCount = eventTimes
        .filter((e) => e.t > now - windowSec)
        .reduce((a, e) => a + e.count, 0);
      const inference = runInferenceChain(audio, windowCount, SIM_SAMPLE_RATE);
      tracer.push('DSP', now, 'stft+mel', `${inference.melFrames.length} frames`, true);
      tracer.push(
        'ML',
        now,
        `readout s=${inference.scores.stable.toFixed(2)} e=${inference.scores.elevated.toFixed(2)} c=${inference.scores.cluster.toFixed(2)}`,
        `trend=${inference.trend} conf=${inference.confidence.toFixed(2)}`,
        true
      );

      // 2) DECISION — feed the firmware node the environment's vitals.
      const pig = env.pig(def.pigId)!;
      maxBodyTempSeen = Math.max(maxBodyTempSeen, pig.coreTemp);
      node.setEnvironment({
        bodyTemp: pig.coreTemp,
        coughRate: Math.round(windowCount * (60 / windowSec)),
        trend: inference.trend,
        position: { x: pig.x, y: pig.y }
      });
      const result = node.tick();
      trendSamples.push({ tSec: now, trend: inference.trend });

      if (result.telemetry) {
        tracer.push('DECISION', now, 'firmware telemetry', `temp=${result.telemetry.bodyTemp.toFixed(1)}`, true);
        tracer.push('MQTT', now, `pub pig/${def.pigId}/telemetry`, undefined, true);
        tracer.push('BRIDGE', now, 'mqtt->pocketbase bridge', undefined, true);
        tracer.push('DB', now, 'pocketbase insert', undefined, true);
        if (result.telemetry.bodyTemp >= FEVER_CRITICAL_TEMP) {
          tracer.push('DECISION', now, 'fever critical', 'temp >= 40.0', false);
        }
      }
      for (const a of result.alert ?? []) {
        alertList.push(a);
        tracer.push('DECISION', now, `alert ${a.type}`, `${a.severity} ${a.value.toFixed(1)}C`, false);
        tracer.push('MQTT', now, `pub pig/${def.pigId}/alerts`, a.type, false);
        tracer.push('BRIDGE', now, 'alert persisted', undefined, true);
        tracer.push('DB', now, 'alert record inserted', undefined, true);
      }

      // 3) Slide the audio ring forward one second.
      audio.copyWithin(0, SIM_SAMPLE_RATE);
      audio.fill(0, audioLen - SIM_SAMPLE_RATE);
    }
  }

  // ── Verdicts ───────────────────────────────────────────────────────────────
  const pig = env.pig(def.pigId)!;
  const checks: ScenarioCheck[] = [];

  if (def.infectAtSec === undefined) {
    checks.push({
      name: 'no fever alerts',
      passed: alertList.length === 0,
      detail: `${alertList.length} alert(s)`
    });
    checks.push({
      name: 'trend stays STABLE',
      passed: trendSamples.every((s) => s.trend === 'STABLE'),
      detail: trendSamples.map((s) => s.trend).join(',')
    });
    checks.push({
      name: 'core temp below fever threshold',
      passed: maxBodyTempSeen < 39.5,
      detail: `max ${maxBodyTempSeen.toFixed(2)}C`
    });
  } else {
    checks.push({
      name: 'fever alert raised',
      passed: alertList.some((a) => a.type.includes('FEVER')),
      detail: alertList.map((a) => a.type).join(',') || 'none'
    });
    const postInfect = trendSamples.filter((s) => s.tSec > def.infectAtSec!);
    checks.push({
      name: 'classifier reads CLUSTER after infection',
      passed: postInfect.some((s) => s.trend === 'CLUSTER'),
      detail: postInfect.map((s) => `${s.tSec.toFixed(0)}s:${s.trend}`).join(' ') || 'no samples'
    });
    checks.push({
      name: 'pig escalated to CRITICAL',
      passed: pig.health === 'CRITICAL',
      detail: `final ${pig.health} at ${pig.coreTemp.toFixed(1)}C`
    });
  }

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    durationSec: def.durationSec,
    passed: checks.every((c) => c.passed),
    checks,
    alerts: alertList,
    finalHealth: pig.health,
    finalCoreTemp: pig.coreTemp,
    trendSamples,
    trace: tracer
  };
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'healthy-baseline',
    name: 'Healthy baseline',
    description: 'One healthy pig, 45 sim-seconds: no fevers, STABLE trend, no escalation.',
    durationSec: 45,
    seed: 0xB0BA5EED,
    pigId: 'd0wd-01'
  },
  {
    id: 'influenza-outbreak',
    name: 'Influenza outbreak',
    description: 'Pig falls ill at ~8s; fever crosses 40.0C, classifier must escalate via CLUSTER and the pig latches CRITICAL.',
    durationSec: 90,
    seed: 0xB0BA5EED,
    pigId: 'd0wd-01',
    infectAtSec: 8
  }
];