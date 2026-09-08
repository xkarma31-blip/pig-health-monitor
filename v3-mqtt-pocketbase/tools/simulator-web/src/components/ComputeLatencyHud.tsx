import { useState } from 'react';

export interface ComputeLatencyHudProps {
  accessible?: boolean;
  className?: string;
}

export interface LatencySection {
  id: string;
  name: string;
  ms: number;
  color: string;
}

/**
 * Pi 5 compute budget HUD showing the ≤35 ms breakdown. Bars are drawn
 * proportional to their share of the budget (data-viz, not decoration) and
 * every displayed number comes from the same `sections` array so the total
 * can never disagree with the parts.
 */
export const LATENCY_BUDGET_MS = 35;
export const LATENCY_SECTIONS: LatencySection[] = [
  { id: 'stft', name: 'STFT', ms: 2, color: '#10b981' },
  { id: 'mel', name: 'Mel', ms: 5, color: '#f59e0b' },
  { id: 'cnn-lstm', name: 'CNN-LSTM', ms: 22, color: '#3b82f6' },
  { id: 'thermal', name: 'Thermal ROI', ms: 6, color: '#8b5cf6' }
];

export function ComputeLatencyHud({
  accessible = false,
  className = ''
}: ComputeLatencyHudProps) {
  const [labelMode, setLabelMode] = useState<'ms' | 'pct'>('ms');
  const total = LATENCY_SECTIONS.reduce((sum, s) => sum + s.ms, 0);
  const budget = LATENCY_BUDGET_MS;

  return (
    <div
      className={`compute-latency-hud ${accessible ? 'accessible' : ''} ${className}`}
      data-testid="latency-hud"
      role="region"
      aria-label={`Pi 5 compute latency breakdown (${budget}ms budget)`}
    >
      <div className="latency-total">
        <span>{total.toFixed(0)} ms</span>
        <span className="latency-budget"> of {budget} ms budget</span>
      </div>
      <div className="latency-sections">
        {LATENCY_SECTIONS.map((s) => (
          <div
            key={s.id}
            className="latency-section"
            style={{
              width: `${Math.max(6, (s.ms / total) * 100)}%`,
              backgroundColor: s.color
            }}
            data-testid={`${s.id}-section`}
          >
            <span className="section-name">{s.name}</span>
            <span className="section-ms">
              {labelMode === 'ms' ? `${s.ms} ms` : `${Math.round((s.ms / total) * 100)}%`}
            </span>
          </div>
        ))}
      </div>
      <button
        className="latency-label-toggle"
        data-testid="latency-label-toggle"
        aria-pressed={labelMode === 'pct'}
        onClick={() => setLabelMode((m) => (m === 'ms' ? 'pct' : 'ms'))}
      >
        Show as {labelMode === 'ms' ? '%' : 'ms'}
      </button>
    </div>
  );
}