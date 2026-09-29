/**
 * DashboardPage — Primary simulation cockpit.
 *
 * Composes the core existing components into a responsive CSS grid
 * and reads live state from the simulation store.
 */
import { useSimulationStore } from '../stores/simulationStore';
import { useSettingsStore } from '../stores/settingsStore';

import { SwineArena } from '../components/SwineArena';
import { ThermalHeatmap } from '../components/ThermalHeatmap';
import { AudioSpectrogram } from '../components/AudioSpectrogram';
import { BarnPanel } from '../components/BarnPanel';
import { ClassifierPanel } from '../components/ClassifierPanel';
import { PipelineTrace } from '../components/PipelineTrace';
import { ScenarioRunner } from '../components/ScenarioRunner';
import { HardwareMonitor } from '../components/HardwareMonitor';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Main dashboard — all critical panels at a glance. */
export default function DashboardPage() {
  const sim = useSimulationStore();
  const accessible = useSettingsStore((s) => s.showAccessible);

  // Map store pigs → ArenaPig shape expected by SwineArena
  const arenaPigs = sim.pigs.map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    temp: p.temp,
    state: p.health === 'fever'
      ? ('CRITICAL' as const)
      : p.health === 'elevated'
        ? ('WARNING' as const)
        : ('NORMAL' as const),
  }));

  // Map store pigs → BarnPigView shape (minimal subset)
  const barnPigs = sim.pigs.map((p) => ({
    id: p.id,
    name: p.id,
    x: p.x,
    y: p.y,
    coreTemp: p.temp,
    health: p.health === 'fever'
      ? ('CRITICAL' as const)
      : p.health === 'elevated'
        ? ('INFECTED' as const)
        : ('HEALTHY' as const),
    coughCount: 0,
    daysSinceInfection: 0,
  }));

  // Active (non-dismissed) alerts for the banner
  const activeAlerts = sim.alerts.filter((a) => !a.dismissed);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <header className="flex flex-wrap items-center gap-4 rounded-xl bg-[#111827] border border-gray-800 px-4 py-3">
        <span className="rounded-full bg-cyan-800 text-cyan-100 text-xs font-bold px-3 py-0.5 tracking-wider">
          SIMULATED
        </span>
        <span className="text-sm">
          Sim <b className="text-white">{sim.simTime.toFixed(1)}s</b> ·{' '}
          {sim.speed}x
        </span>
        <span className="text-sm">
          Pigs <b className="text-white">{sim.pigs.length}</b>
        </span>
        <span className="text-sm">
          Alerts{' '}
          <b className={activeAlerts.length > 0 ? 'text-red-400' : 'text-white'}>
            {activeAlerts.length}
          </b>
        </span>
      </header>

      {/* Alert banner */}
      {activeAlerts.length > 0 && (
        <div
          className="rounded-xl bg-red-950 border border-red-500 px-4 py-3 text-red-200"
          role="alert"
        >
          <b className="text-white">{activeAlerts[activeAlerts.length - 1].type}</b>{' '}
          — Zone {activeAlerts[activeAlerts.length - 1].zoneId + 1},{' '}
          confidence {(activeAlerts[activeAlerts.length - 1].confidence * 100).toFixed(0)}%
          <button
            className="ml-4 text-xs text-red-400 underline"
            onClick={() =>
              sim.dismissAlert(activeAlerts[activeAlerts.length - 1].id)
            }
          >
            dismiss
          </button>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* SwineArena — spans 2 cols on md+ */}
        <section className="md:col-span-2 rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Swine Arena
          </h2>
          <SwineArena pigs={arenaPigs} accessible={accessible} />
        </section>

        {/* Thermal Heatmap */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Thermal Heatmap
          </h2>
          <ThermalHeatmap frame={sim.thermalFrame} accessible={accessible} />
        </section>

        {/* Audio Spectrogram */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Audio Spectrogram
          </h2>
          <AudioSpectrogram sampleRate={8000} accessible={accessible} />
        </section>

        {/* Barn Panel */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Barn Environment
          </h2>
          <BarnPanel
            pigs={barnPigs}
            simTimeSec={sim.simTime}
            onInfect={() => {}}
            accessible={accessible}
          />
        </section>

        {/* Classifier Panel */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            AI Classifier
          </h2>
          <ClassifierPanel view={null} accessible={accessible} />
        </section>

        {/* Pipeline Trace */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Pipeline Trace
          </h2>
          <PipelineTrace events={[]} accessible={accessible} />
        </section>

        {/* Scenario Runner */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Scenario Runner
          </h2>
          <ScenarioRunner accessible={accessible} />
        </section>

        {/* Hardware Monitor */}
        <section className="rounded-xl bg-[#111827] border border-gray-800 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
            Hardware Monitor
          </h2>
          <HardwareMonitor accessible={accessible} />
        </section>
      </div>
    </div>
  );
}
