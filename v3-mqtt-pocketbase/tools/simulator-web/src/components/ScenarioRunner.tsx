import { useState } from 'react';
import { SCENARIOS, runScenario, type ScenarioVerdict } from '../engines/scenarios';

interface ScenarioRunnerProps {
  accessible: boolean;
}

/**
 * Scenario runner — runs the SAME engine the unit tests assert against, so a
 * green test here is also a green verdict on screen. reruns are deterministic
 * (seeded RNGs throughout the pipeline).
 */
export function ScenarioRunner({ accessible }: ScenarioRunnerProps) {
  const [verdicts, setVerdicts] = useState<Record<string, ScenarioVerdict>>({});
  const [running, setRunning] = useState<string | null>(null);

  const play = (id: string) => {
    const def = SCENARIOS.find((s) => s.id === id);
    if (!def) return;
    setRunning(id);
    // Simulated time runs vastly faster than real; the run is synchronous.
    // Yield once so the Play button repaints before the verdict lands.
    setTimeout(() => {
      setVerdicts((v) => ({ ...v, [id]: runScenario(def) }));
      setRunning(null);
    }, 30);
  };

  return (
    <div className={`scenario-runner${accessible ? ' accessible' : ''}`} data-testid="scenario-runner">
      <div className="scenario-actions">
        {SCENARIOS.map((def) => (
          <button
            key={def.id}
            type="button"
            className="scenario-play-btn"
            data-testid={`scenario-play-${def.id}`}
            disabled={running !== null}
            onClick={() => play(def.id)}
          >
            ▶ {def.name}
          </button>
        ))}
      </div>
      {running && (
        <div className="scenario-running" aria-live="polite">
          running {running}…
        </div>
      )}
      <div className="verdicts" aria-live="polite">
        {SCENARIOS.filter((s) => verdicts[s.id]).map((def) => {
          const v = verdicts[def.id];
          return (
            <div
              key={def.id}
              className={`verdict ${v.passed ? 'verdict-pass' : 'verdict-fail'}`}
              data-testid={`verdict-${def.id}`}
            >
              <div className="verdict-head">
                <span className="verdict-name">{def.name}</span>
                <span
                  className={`verdict-badge ${v.passed ? 'verdict-badge-pass' : 'verdict-badge-fail'}`}
                >
                  {v.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <p className="verdict-desc">{def.description}</p>
              <ul className="check-list">
                {v.checks.map((c) => (
                  <li
                    key={c.name}
                    className={`check-row ${c.passed ? 'check-pass' : 'check-fail'}`}
                    data-testid={`check-${c.name.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <span className="check-mark">{c.passed ? '✔' : '✘'}</span>
                    <span className="check-name">{c.name}</span>
                    <span className="check-detail">{c.detail}</span>
                  </li>
                ))}
              </ul>
              <div className="verdict-meta">
                final {v.finalHealth} @ {v.finalCoreTemp.toFixed(1)}°C · {v.alerts.length} alert(s) ·
                {v.trendSamples.length > 0 ? v.trendSamples[v.trendSamples.length - 1].trend : '—'} at end
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}