/**
 * settingsStore — Persisted user-configurable settings.
 *
 * Uses zustand `persist` middleware to survive page reloads via
 * localStorage.  Every threshold / calibration knob lives here so
 * pages can read them without prop-drilling.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Physical mic placement in the pen (meters). */
export interface MicPosition {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface SettingsState {
  feverThreshold: number;
  coughConfidenceThreshold: number;
  alertCooldownSec: number;
  baselineDays: number;
  zScoreThreshold: number;
  micPositions: MicPosition[];
  showAccessible: boolean;
  darkMode: boolean;

  // Actions
  setFeverThreshold: (v: number) => void;
  setCoughConfidenceThreshold: (v: number) => void;
  setAlertCooldownSec: (v: number) => void;
  setBaselineDays: (v: number) => void;
  setZScoreThreshold: (v: number) => void;
  setMicPositions: (p: MicPosition[]) => void;
  toggleAccessible: () => void;
  toggleDarkMode: () => void;
  resetDefaults: () => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS = {
  feverThreshold: 39.5,
  coughConfidenceThreshold: 0.7,
  alertCooldownSec: 300,
  baselineDays: 7,
  zScoreThreshold: 2.58,
  micPositions: [
    { id: 'mic-1', x: 2, y: 2, z: 2.5 },
    { id: 'mic-2', x: 4, y: 4, z: 2.5 },
  ] as MicPosition[],
  showAccessible: false,
  darkMode: true,
};

// ---------------------------------------------------------------------------
// Store (persisted to localStorage)
// ---------------------------------------------------------------------------

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setFeverThreshold: (v) => set({ feverThreshold: v }),
      setCoughConfidenceThreshold: (v) => set({ coughConfidenceThreshold: v }),
      setAlertCooldownSec: (v) => set({ alertCooldownSec: v }),
      setBaselineDays: (v) => set({ baselineDays: v }),
      setZScoreThreshold: (v) => set({ zScoreThreshold: v }),
      setMicPositions: (p) => set({ micPositions: p }),
      toggleAccessible: () => set((s) => ({ showAccessible: !s.showAccessible })),
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
      resetDefaults: () => set(DEFAULTS),
    }),
    {
      name: 'pigpulse-settings',
      // Only persist plain-serialisable keys (skip function actions)
      partialize: (state) => ({
        feverThreshold: state.feverThreshold,
        coughConfidenceThreshold: state.coughConfidenceThreshold,
        alertCooldownSec: state.alertCooldownSec,
        baselineDays: state.baselineDays,
        zScoreThreshold: state.zScoreThreshold,
        micPositions: state.micPositions,
        showAccessible: state.showAccessible,
        darkMode: state.darkMode,
      }),
    },
  ),
);
