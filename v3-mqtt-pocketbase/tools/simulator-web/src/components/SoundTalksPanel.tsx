import type { SoundTalksCalibration, SoundTalksState } from '../engines/soundTalks';

export interface SoundTalksPanelProps {
  state: SoundTalksState;
  onCalibrationChange: (patch: Partial<SoundTalksCalibration>) => void;
  onCalibrateNow: () => void;
  onResetBaseline: () => void;
  accessible?: boolean;
}

const BAND_CLASS: Record<SoundTalksState['band'], string> = {
  GREEN: 'band-green',
  YELLOW: 'band-yellow',
  RED: 'band-red'
};

/**
 * The vet-facing respiration health surface — a SoundTalks-style ReHS
 * (respiration health score 0..100) plus RDI (coughs/head/day), a 24-bin
 * hourly sparkline, and the calibration toggles a farm would tune live:
 * head count, baseline coughs/head/day, sensitivity, alarm delta, auto-baseline.
 */
export function SoundTalksPanel({ state, onCalibrationChange, onCalibrateNow, onResetBaseline }: SoundTalksPanelProps) {
  const c = state.calibration;
  return (
    <section className="panel soundtalks-panel" data-testid="soundtalks-panel" aria-label="Respiration health (SoundTalks-style)">
      <h3>Respiration Health <span className="scene-hint">SoundTalks-style · ReHS</span></h3>

      <div className="soundtalks-readout">
        <div className="soundtalks-big" data-testid="soundtalks-rdi">
          <span className="scene-hint">RDI</span>
          <b>{state.rdi.toFixed(1)}</b>
          <span className="scene-hint">coughs/head/day</span>
        </div>
        <div className="soundtalks-big" data-testid="soundtalks-rehs">
          <span className="scene-hint">ReHS</span>
          <b>{Math.round(state.rehs)}</b>
          <span className="scene-hint">0…100</span>
        </div>
        <span className={`badge ${BAND_CLASS[state.band]}`} data-testid="soundtalks-band">
          {state.band}
        </span>
        <span className={`badge ${state.alarm ? 'badge-alarm' : 'badge-ok'}`} data-testid="soundtalks-alarm">
          {state.alarm ? 'ALARM' : 'calm'}
        </span>
        <span className={`badge ${state.trend ? 'badge-warn' : 'badge-ok'}`} data-testid="soundtalks-trend">
          {state.trend ? 'trend ↑' : 'trend —'}
        </span>
      </div>

      <div className="sparkline" data-testid="soundtalks-sparkline" aria-label="Coughs per simulated hour (24h)">
        {state.hourlyCoughs.map((n, i) => (
          <i
            key={i}
            className="spark-bar"
            data-count={n}
            style={{ height: `${Math.min(100, (n / Math.max(1, state.rdi * 2)) * 100)}%` }}
            title={`h${String(i).padStart(2, '0')}: ${n}`}
          />
        ))}
      </div>

      <fieldset className="soundtalks-cal" data-testid="soundtalks-calibration">
        <legend>Calibration {state.baselineLearned ? '(learned)' : '(factory default)'}</legend>
        <label className="env-slider">
          <span>Head count</span>
          <input
            type="number"
            min={1}
            step={1}
            data-testid="soundtalks-cal-head"
            value={c.headCount}
            onChange={(e) => onCalibrationChange({ headCount: Number(e.target.value) })}
          />
        </label>
        <label className="env-slider">
          <span>Baseline coughs/head/day</span>
          <input
            type="number"
            min={1}
            step={1}
            data-testid="soundtalks-cal-baseline"
            value={c.baselineCoughsPerHeadDay}
            onChange={(e) => onCalibrationChange({ baselineCoughsPerHeadDay: Number(e.target.value) })}
          />
        </label>
        <label className="env-slider">
          <span>Sensitivity ({c.sensitivity.toFixed(2)}×)</span>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            data-testid="soundtalks-cal-sensitivity"
            value={c.sensitivity}
            onChange={(e) => onCalibrationChange({ sensitivity: Number(e.target.value) })}
          />
        </label>
        <label className="env-slider">
          <span>Alarm delta (coughs/h)</span>
          <input
            type="number"
            min={1}
            step={1}
            data-testid="soundtalks-cal-delta"
            value={c.alarmDelta}
            onChange={(e) => onCalibrationChange({ alarmDelta: Number(e.target.value) })}
          />
        </label>
        <label className="env-slider">
          <span>Auto-baseline (learns from herd)</span>
          <input
            type="checkbox"
            data-testid="soundtalks-auto-baseline"
            checked={c.autoBaseline}
            onChange={(e) => onCalibrationChange({ autoBaseline: e.target.checked })}
          />
        </label>
      </fieldset>

      <div className="env-event-buttons">
        <button type="button" className="btn" data-testid="soundtalks-calibrate" onClick={onCalibrateNow}>
          Calibrate now (from heard herd)
        </button>
        <button type="button" className="btn" data-testid="soundtalks-reset" onClick={onResetBaseline}>
          Reset baseline
        </button>
      </div>

      <span className="sr-only">
        ReHS mirrors the research literature: RDI is coughs per head per day, and the score
        falls 40 points for each full baseline of extra coughing. Alarm sounds on RED or spikes.
      </span>
    </section>
  );
}

export default SoundTalksPanel;