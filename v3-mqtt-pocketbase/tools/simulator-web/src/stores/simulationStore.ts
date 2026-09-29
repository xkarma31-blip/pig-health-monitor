/**
 * simulationStore — Zustand store holding ALL live simulation state.
 *
 * Every page reads from here; the simulation loop (or future MQTT bridge)
 * writes into it via the action methods.  Typed arrays (Float32Array) are
 * used for thermal / audio buffers to match the engine layer.
 */
import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single detected cough event from the audio pipeline. */
export interface CoughEvent {
  t: number;
  confidence: number;
  distance: number;
  pigId: string;
}

/** Zone-level aggregated health state. */
export interface SimZone {
  id: number;
  label: string;
  healthScore: number;
  pigCount: number;
  feverRisk: number;
  occlusionFactor: number;
  confidence: number;
}

/** Individual pig state for the arena / barn view. */
export interface SimPig {
  id: string;
  x: number;
  y: number;
  temp: number;
  zoneId: number;
  health: 'healthy' | 'elevated' | 'fever';
}

/** Alert raised by the fusion / confidence engine. */
export interface SimAlert {
  id: string;
  zoneId: number;
  type: 'fever' | 'cough_cluster' | 'false_positive';
  confidence: number;
  timestamp: number;
  modalities: string[];
  dismissed: boolean;
}

/** Fusion weight triple (sums need not equal 1). */
export interface FusionWeights {
  audio: number;
  thermal: number;
  cctv: number;
}

/** One entry in the 7-day rolling baseline. */
export interface BaselineDay {
  day: number;
  avgTemp: number;
  coughRate: number;
}

// ---------------------------------------------------------------------------
// State + actions contract
// ---------------------------------------------------------------------------

export interface SimulationState {
  // -- Sim control --
  isRunning: boolean;
  speed: number;
  simTime: number;

  // -- Thermal --
  thermalFrame: Float32Array;
  superResFrame: Float32Array | null;
  sunlightIntensity: number;
  timeOfDay: number;

  // -- Audio --
  audioBuffer: Float32Array;
  coughEvents: CoughEvent[];
  noiseLevel: number;
  gainMode: 'agc' | 'fixed';

  // -- Zones --
  zones: SimZone[];

  // -- Pigs --
  pigs: SimPig[];

  // -- Alerts --
  alerts: SimAlert[];

  // -- Fusion --
  fusionWeights: FusionWeights;
  baselineData: BaselineDay[];

  // -- Actions --
  toggleRunning: () => void;
  setSpeed: (s: number) => void;
  setTimeOfDay: (h: number) => void;
  setGainMode: (m: 'agc' | 'fixed') => void;
  setNoiseLevel: (n: number) => void;
  setSunlightIntensity: (s: number) => void;
  updateThermalFrame: (f: Float32Array) => void;
  updateSuperResFrame: (f: Float32Array) => void;
  updateAudioBuffer: (b: Float32Array) => void;
  addCoughEvent: (e: CoughEvent) => void;
  updateZones: (z: SimZone[]) => void;
  updatePigs: (p: SimPig[]) => void;
  addAlert: (a: Omit<SimAlert, 'id'>) => void;
  dismissAlert: (id: string) => void;
  setFusionWeights: (w: FusionWeights) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let alertCounter = 0;

function makeAlertId(): string {
  alertCounter += 1;
  return `alert-${Date.now()}-${alertCounter}`;
}

function randomInRange(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

// ---------------------------------------------------------------------------
// Initial state factory (called on create and on reset)
// ---------------------------------------------------------------------------

function initialState() {
  return {
    isRunning: false,
    speed: 1,
    simTime: 0,

    thermalFrame: new Float32Array(32 * 24).fill(30),
    superResFrame: null as Float32Array | null,
    sunlightIntensity: 0.3,
    timeOfDay: 8,

    audioBuffer: new Float32Array(4096).fill(0),
    coughEvents: [] as CoughEvent[],
    noiseLevel: 45,
    gainMode: 'fixed' as const,

    zones: [
      { id: 0, label: 'Zone 1', healthScore: 85, pigCount: 1, feverRisk: 0.05, occlusionFactor: 0.1, confidence: 0.92 },
      { id: 1, label: 'Zone 2', healthScore: 90, pigCount: 1, feverRisk: 0.03, occlusionFactor: 0.05, confidence: 0.95 },
      { id: 2, label: 'Zone 3', healthScore: 88, pigCount: 1, feverRisk: 0.04, occlusionFactor: 0.08, confidence: 0.93 },
      { id: 3, label: 'Zone 4', healthScore: 82, pigCount: 1, feverRisk: 0.07, occlusionFactor: 0.12, confidence: 0.90 },
    ] as SimZone[],

    pigs: [
      { id: 'pig-001', x: randomInRange(0.1, 0.4), y: randomInRange(0.1, 0.4), temp: 38.4, zoneId: 0, health: 'healthy' as const },
      { id: 'pig-002', x: randomInRange(0.6, 0.9), y: randomInRange(0.1, 0.4), temp: 38.6, zoneId: 1, health: 'healthy' as const },
      { id: 'pig-003', x: randomInRange(0.1, 0.4), y: randomInRange(0.6, 0.9), temp: 38.5, zoneId: 2, health: 'healthy' as const },
      { id: 'pig-004', x: randomInRange(0.6, 0.9), y: randomInRange(0.6, 0.9), temp: 39.1, zoneId: 3, health: 'elevated' as const },
    ] as SimPig[],

    alerts: [] as SimAlert[],

    fusionWeights: { audio: 0.6, thermal: 0.4, cctv: 0.2 } as FusionWeights,

    baselineData: Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      avgTemp: 38.3 + Math.random() * 0.4,
      coughRate: 1.2 + Math.random() * 0.8,
    })) as BaselineDay[],
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSimulationStore = create<SimulationState>()((set) => ({
  ...initialState(),

  toggleRunning: () => set((s) => ({ isRunning: !s.isRunning })),
  setSpeed: (speed) => set({ speed }),
  setTimeOfDay: (h) => set({ timeOfDay: h }),
  setGainMode: (m) => set({ gainMode: m }),
  setNoiseLevel: (n) => set({ noiseLevel: n }),
  setSunlightIntensity: (s) => set({ sunlightIntensity: s }),

  updateThermalFrame: (f) => set({ thermalFrame: f }),
  updateSuperResFrame: (f) => set({ superResFrame: f }),
  updateAudioBuffer: (b) => set({ audioBuffer: b }),

  addCoughEvent: (e) =>
    set((s) => ({ coughEvents: [...s.coughEvents.slice(-199), e] })),

  updateZones: (zones) => set({ zones }),
  updatePigs: (pigs) => set({ pigs }),

  addAlert: (a) =>
    set((s) => ({
      alerts: [...s.alerts, { ...a, id: makeAlertId() }],
    })),

  dismissAlert: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) => (a.id === id ? { ...a, dismissed: true } : a)),
    })),

  setFusionWeights: (w) => set({ fusionWeights: w }),

  reset: () => set(initialState()),
}));
