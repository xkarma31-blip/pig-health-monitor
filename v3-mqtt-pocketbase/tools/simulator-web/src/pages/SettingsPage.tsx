/**
 * SettingsPage — Configuration hub.
 *
 * Composes existing settings-oriented panels (ChaosPanel,
 * EnvironmentConsole, SoundTalksPanel, StoragePanel) alongside
 * new editors for thresholds, mic positions, and fusion weights.
 */
import { useState } from 'react';
import { Settings, Mic, Sliders, RotateCcw } from 'lucide-react';
import { useSettingsStore, type MicPosition } from '../stores/settingsStore';
import { useSimulationStore } from '../stores/simulationStore';

import { ChaosPanel } from '../components/ChaosPanel';
import { StoragePanel } from '../components/StoragePanel';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Threshold sliders for fever, cough confidence, z-score, cooldown. */
function ThresholdEditor() {
  const s = useSettingsStore();

  const sliders = [
    { label: 'Fever threshold (C)', value: s.feverThreshold, set: s.setFeverThreshold, min: 38, max: 42, step: 0.1, fmt: (v: number) => v.toFixed(1) },
    { label: 'Cough confidence', value: s.coughConfidenceThreshold, set: s.setCoughConfidenceThreshold, min: 0.1, max: 1, step: 0.05, fmt: (v: number) => v.toFixed(2) },
    { label: 'Z-score threshold', value: s.zScoreThreshold, set: s.setZScoreThreshold, min: 1, max: 4, step: 0.01, fmt: (v: number) => v.toFixed(2) },
    { label: 'Alert cooldown (s)', value: s.alertCooldownSec, set: s.setAlertCooldownSec, min: 30, max: 900, step: 30, fmt: (v: number) => String(v) },
    { label: 'Baseline days', value: s.baselineDays, set: s.setBaselineDays, min: 3, max: 14, step: 1, fmt: (v: number) => String(v) },
  ];

  return (
    <div className="space-y-3">
      {sliders.map((sl) => (
        <label key={sl.label} className="flex flex-col gap-1 text-sm">
          <span>
            {sl.label}: <b className="text-white">{sl.fmt(sl.value)}</b>
          </span>
          <input
            type="range"
            min={sl.min}
            max={sl.max}
            step={sl.step}
            value={sl.value}
            onChange={(e) => sl.set(parseFloat(e.target.value))}
            className="w-full accent-cyan-400"
          />
        </label>
      ))}
    </div>
  );
}

/** Mic position editor with add / remove / coordinate inputs. */
function MicPositionEditor() {
  const mics = useSettingsStore((s) => s.micPositions);
  const setMics = useSettingsStore((s) => s.setMicPositions);

  const update = (idx: number, field: keyof MicPosition, value: string) => {
    const next = mics.map((m, i) =>
      i === idx ? { ...m, [field]: field === 'id' ? value : parseFloat(value) || 0 } : m,
    );
    setMics(next);
  };

  const addMic = () => {
    setMics([...mics, { id: `mic-${mics.length + 1}`, x: 2, y: 2, z: 2.5 }]);
  };

  const removeMic = (idx: number) => {
    if (mics.length <= 1) return;
    setMics(mics.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {mics.map((mic, i) => (
        <div
          key={mic.id}
          className="flex flex-wrap items-center gap-2 rounded-lg bg-[#0b1220] border border-gray-800 p-2 text-sm"
        >
          <span className="text-gray-400 w-14 shrink-0">{mic.id}</span>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <label key={axis} className="flex items-center gap-1">
              <span className="text-xs text-gray-500 uppercase">{axis}:</span>
              <input
                type="number"
                step={0.5}
                value={mic[axis]}
                onChange={(e) => update(i, axis, e.target.value)}
                className="w-16 bg-[#111827] border border-gray-700 rounded px-1.5 py-0.5 text-white text-sm"
              />
            </label>
          ))}
          <button
            onClick={() => removeMic(i)}
            className="text-xs text-red-400 hover:text-red-300 ml-auto"
            disabled={mics.length <= 1}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        onClick={addMic}
        className="px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-400 text-sm hover:bg-cyan-500/10 transition-colors"
      >
        + Add Mic
      </button>
    </div>
  );
}

/** Fusion weight editor with linked sliders. */
function FusionWeightEditor() {
  const sim = useSimulationStore();
  const w = sim.fusionWeights;

  const setWeight = (key: keyof typeof w, value: number) => {
    sim.setFusionWeights({ ...w, [key]: value });
  };

  return (
    <div className="space-y-3">
      {([
        { key: 'audio' as const, label: 'Audio weight', color: 'cyan' },
        { key: 'thermal' as const, label: 'Thermal weight', color: 'amber' },
        { key: 'cctv' as const, label: 'CCTV weight', color: 'green' },
      ]).map((item) => (
        <label key={item.key} className="flex flex-col gap-1 text-sm">
          <span>
            {item.label}:{' '}
            <b className="text-white">{w[item.key].toFixed(2)}</b>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={w[item.key]}
            onChange={(e) => setWeight(item.key, parseFloat(e.target.value))}
            className={`w-full ${
              item.color === 'cyan'
                ? 'accent-cyan-400'
                : item.color === 'amber'
                  ? 'accent-amber-400'
                  : 'accent-green-400'
            }`}
          />
        </label>
      ))}
      <p className="text-xs text-gray-500">
        Sum: {(w.audio + w.thermal + w.cctv).toFixed(2)} (does not need to equal 1)
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

/** Settings page — thresholds, mics, fusion, chaos, storage. */
export default function SettingsPage() {
  const settings = useSettingsStore();
  const accessible = settings.showAccessible;

  // Minimal stubs for StoragePanel props
  const [retentionSec] = useState(86400);
  const stubStats = { retained: 0, capacity: 1000, evictedByAge: 0, evictedByCapacity: 0, estBytes: 0 };

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="text-cyan-400" size={24} />
          <h1 className="text-lg font-bold text-white">Settings</h1>
        </div>
        <button
          onClick={settings.resetDefaults}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 text-sm hover:text-white hover:border-gray-500 transition-colors"
        >
          <RotateCcw size={14} /> Reset Defaults
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Threshold sliders */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-2">
            <Sliders size={16} /> Detection Thresholds
          </h2>
          <ThresholdEditor />
        </section>

        {/* Mic position editor */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center gap-2">
            <Mic size={16} /> Microphone Positions
          </h2>
          <MicPositionEditor />
        </section>

        {/* Fusion weight editor */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Fusion Weights
          </h2>
          <FusionWeightEditor />
        </section>

        {/* Accessibility + dark mode toggles */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Display
          </h2>
          <div className="space-y-3">
            <label className="flex items-center justify-between text-sm">
              <span>Accessible mode (larger text, higher contrast)</span>
              <input
                type="checkbox"
                checked={settings.showAccessible}
                onChange={settings.toggleAccessible}
                className="w-5 h-5 accent-cyan-400"
              />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span>Dark mode</span>
              <input
                type="checkbox"
                checked={settings.darkMode}
                onChange={settings.toggleDarkMode}
                className="w-5 h-5 accent-cyan-400"
              />
            </label>
          </div>
        </section>

        {/* ChaosPanel (existing) */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Chaos Monkey
          </h2>
          <ChaosPanel accessible={accessible} />
        </section>

        {/* StoragePanel (existing) */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Telemetry Storage
          </h2>
          <StoragePanel
            stats={stubStats}
            retentionSeconds={retentionSec}
            onRetentionChange={() => {}}
            accessible={accessible}
          />
        </section>
      </div>
    </div>
  );
}
