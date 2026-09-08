import type { EnvironmentParams, EntropyEventName } from '../engines/environment';

export interface EnvironmentConsoleProps {
  params: EnvironmentParams;
  ambientTemp: number;
  activeEvents: string[];
  recentInfections: Array<{ pigId: string; sourceId: string }>;
  speed: number;
  onParamsChange: (p: Partial<EnvironmentParams>) => void;
  onEvent: (name: EntropyEventName) => void;
  onSpeedChange: (speed: number) => void;
  accessible?: boolean;
}

const SLIDERS: Array<{
  key: keyof EnvironmentParams;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'ambientBaseTemp', label: 'Ambient base temp °C', min: 20, max: 35, step: 0.5 },
  { key: 'diurnalAmplitude', label: 'Diurnal swing °C', min: 0, max: 4, step: 0.25 },
  { key: 'humidity', label: 'Humidity', min: 0, max: 1, step: 0.05 },
  { key: 'airFlow', label: 'Air flow (ventilation)', min: 0, max: 1, step: 0.05 },
  { key: 'entropy', label: 'Entropy (stochastic events)', min: 0, max: 1, step: 0.05 },
  { key: 'contagionRadius', label: 'Contagion radius', min: 0, max: 0.6, step: 0.05 },
  { key: 'contagionRate', label: 'Contagion rate', min: 0, max: 1, step: 0.05 },
  { key: 'wanderSpeed', label: 'Wander speed', min: 0, max: 0.06, step: 0.002 },
  { key: 'ambientNoise', label: 'Ambient noise °C', min: 0, max: 0.2, step: 0.01 }
];

const EVENTS: EntropyEventName[] = ['DRAFT', 'HEAT_SPIKE', 'DOOR_OPEN'];

/**
 * Live environmental control panel — the "realism must be opt-in" surface:
 * diurnal cycle, entropy events, contagion and ventilation are all knobs here.
 */
export function EnvironmentConsole({
  params,
  ambientTemp,
  activeEvents,
  recentInfections,
  speed,
  onParamsChange,
  onEvent,
  onSpeedChange
}: EnvironmentConsoleProps) {
  return (
    <div className="env-console" data-testid="env-console" role="group" aria-label="Environment console">
      <div className="env-readout">
        <span className="badge" data-testid="env-ambient-now">
          Ambient {ambientTemp.toFixed(1)}°C
        </span>
        <span className="badge">
          Speed
          <select
            data-testid="env-speed"
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </span>
      </div>

      <div className="env-sliders">
        {SLIDERS.map((s) => (
          <label key={s.key} className="env-slider" data-testid={`env-param-${String(s.key)}`}>
            <span>
              {s.label}: <b>{Number(params[s.key] ?? 0).toFixed(s.step < 0.05 ? 3 : 2)}</b>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={params[s.key] ?? 0}
              onChange={(e) => onParamsChange({ [s.key]: Number(e.target.value) } as Partial<EnvironmentParams>)}
            />
          </label>
        ))}
      </div>

      <div className="env-events">
        <span className="scene-hint">Triggers (seeded — deterministic per snapshot):</span>
        <div className="env-event-buttons">
          {EVENTS.map((name) => (
            <button key={name} type="button" className="btn" data-testid={`env-event-${name}`} onClick={() => onEvent(name)}>
              {name.replace('_', ' ')}
            </button>
          ))}
        </div>
        {activeEvents.length > 0 && (
          <p data-testid="env-active-events">Active: {activeEvents.join(', ')}</p>
        )}
        {recentInfections.length > 0 && (
          <ul data-testid="env-infections">
            {recentInfections.slice(-4).map((i) => (
              <li key={`${i.pigId}-${i.sourceId}`}>
                <b>{i.pigId}</b> infected by {i.sourceId}
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="sr-only">All open-air factors and contagion start disabled and are switched on here.</span>
    </div>
  );
}

export default EnvironmentConsole;