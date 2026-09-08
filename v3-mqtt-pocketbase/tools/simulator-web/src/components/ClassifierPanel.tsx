import { useEffect, useRef } from 'react';
import type { ClassifierScores, TrendLabel } from '../engines/inferenceChain';

export interface ClassifierView {
  melFrames: Float32Array[];
  scores: ClassifierScores;
  trend: TrendLabel;
  confidence: number;
  coughCount: number;
}

interface ClassifierPanelProps {
  view: ClassifierView | null;
  accessible: boolean;
}

const MEL_BANDS = 40;
const CANVAS_W = 250;
const CANVAS_H = 110;
const MAX_COLS = 64;

const TREND_CLASS: Record<TrendLabel, string> = {
  STABLE: 'trend-stable',
  ELEVATED: 'trend-elevated',
  CLUSTER: 'trend-cluster'
};

/** map a log-mel value (−6..−1) onto a blue→magenta ramp */
function melColor(v: number): string {
  const t = Math.min(1, Math.max(0, (v + 6) / 5));
  // rgb(4..) navy → cyan → magenta
  const r = 30 + t * 170;
  const g = 60 + t * 100;
  const b = 120 + t * 100;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/**
 * The AI layer exposed: real log-mel heatmap from the DSP pipeline plus the
 * 3-class readout (STABLE / ELEVATED / CLUSTER) with confidence.
 */
export function ClassifierPanel({ view, accessible }: ClassifierPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const frames = view?.melFrames ?? [];
    if (frames.length === 0) {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '12px sans-serif';
      ctx.fillText('awaiting audio pipeline…', 12, CANVAS_H / 2 + 4);
      return;
    }
    const stride = Math.max(1, Math.ceil(frames.length / MAX_COLS));
    let col = 0;
    for (let f = frames.length - 1; f >= 0 && col < MAX_COLS; f -= stride, col++) {
      const frame = frames[f];
      for (let b = 0; b < MEL_BANDS; b++) {
        ctx.fillStyle = melColor(frame[b] ?? -6);
        ctx.fillRect(
          CANVAS_W - (col + 1) * (CANVAS_W / Math.min(MAX_COLS, Math.ceil(frames.length / stride))),
          (MEL_BANDS - 1 - b) * (CANVAS_H / MEL_BANDS),
          CANVAS_W / MAX_COLS + 0.5,
          CANVAS_H / MEL_BANDS + 0.5
        );
      }
    }
  }, [view]);

  const s = view?.scores;
  const rows: Array<[TrendLabel, number | undefined]> = [
    ['STABLE', s?.stable],
    ['ELEVATED', s?.elevated],
    ['CLUSTER', s?.cluster]
  ];

  return (
    <div className={`classifier${accessible ? ' accessible' : ''}`} data-testid="classifier-panel">
      <canvas
        ref={canvasRef}
        data-testid="mel-canvas"
        width={CANVAS_W}
        height={CANVAS_H}
        aria-label="Log-mel spectrogram heatmap from the DSP pipeline"
      />
      <div className="classifier-meta">
        <span
          className={`trend-badge ${view ? TREND_CLASS[view.trend] : 'trend-idle'}`}
          data-testid="trend-badge"
        >
          {view ? view.trend : '—'}
        </span>
        <span className="classifier-conf" data-testid="classifier-conf">
          conf {view ? view.confidence.toFixed(2) : '0.00'}
        </span>
        <span className="classifier-coughs" data-testid="classifier-coughs">
          coughs/30s {view ? view.coughCount : 0}
        </span>
      </div>
      <div className="score-rows">
        {rows.map(([label, value]) => (
          <div key={label} className="score-row">
            <span className="score-label">{label}</span>
            <div className="score-track">
              <div
                className={`score-fill score-${label.toLowerCase()}`}
                data-testid={`score-${label.toLowerCase()}`}
                style={{ width: `${((value ?? 0) * 100).toFixed(1)}%` }}
              />
            </div>
            <span className="score-value">{value != null ? value.toFixed(2) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}